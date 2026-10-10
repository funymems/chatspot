import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  activityEvents,
  automationExecutions,
  automationVersions,
  automations,
  conversations,
  nodeExecutionLogs,
  notifications,
} from "@/lib/server/db/schema";
import { logger } from "@/lib/server/logger";
import { getChannelProvider } from "@/lib/channels/registry";
import {
  automationGraph,
  type ActionDef,
  type AiResponseConfig,
  type AutomationGraph,
  type ConditionConfig,
  type EndConfig,
  type GraphNode,
  type MessageConfig,
} from "@/lib/domain/graph/schema";
import { evaluateCondition, extractEmail, extractPhone, renderTemplate, type EvalScope } from "@/lib/domain/engine/expressions";
import {
  addTagToContact,
  loadScopeParts,
  removeTagFromContact,
  setContactField,
} from "@/lib/server/services/contact-data";
import { enqueueJob } from "@/lib/server/jobs/queue";
import { runAiStep } from "./ai-step";
import {
  initialState,
  NodeTimeoutError,
  RetryableError,
  type ExecState,
  type ExecutionInput,
  type ResumeInput,
  type WaitState,
} from "./types";

const NODE_TIMEOUT_MS: Partial<Record<GraphNode["type"], number>> = { ai_response: 25_000 };
const DEFAULT_NODE_TIMEOUT_MS = 5_000;
const MAX_RETRIES = 3;
const MAX_REDIRECT_DEPTH = 3;
const CONSECUTIVE_LIVE_FAILURES_FOR_ERROR = 3;

type Execution = typeof automationExecutions.$inferSelect;

type StepResult =
  | { kind: "next"; handle?: "out" | "true" | "false"; output?: unknown; input?: unknown }
  | { kind: "end"; output?: unknown; input?: unknown; outcome: string; label?: string }
  | { kind: "pause"; wait: Omit<WaitState, "token">; runAt?: Date; output?: unknown; input?: unknown };

// ─── Per-execution mutex (single process) ───────────────────────────────────

// Kept on globalThis: Next may load this module in several bundles within one process.
const lockKey = Symbol.for("chatspot.executionLocks");
const running: Map<string, Promise<unknown>> = ((globalThis as Record<symbol, unknown>)[lockKey] as Map<string, Promise<unknown>>) ??
  ((globalThis as Record<symbol, unknown>)[lockKey] = new Map<string, Promise<unknown>>());
async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  while (running.has(id)) await running.get(id)!.catch(() => undefined);
  const p = fn();
  running.set(id, p);
  try {
    return await p;
  } finally {
    running.delete(id);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export type StartParams = {
  workspaceId: string;
  automationId: string;
  versionId: string;
  conversationId: string | null;
  contactId: string | null;
  mode: "test" | "live";
  input: ExecutionInput;
  inboundEventId?: string | null;
  redirectDepth?: number;
  retryOf?: string | null;
  vars?: Record<string, string>;
};

/** Creates an execution starting at the trigger and runs it until it finishes or pauses. */
export async function startExecution(p: StartParams): Promise<Execution> {
  const db = await getDb();
  const [version] = await db.select().from(automationVersions).where(eq(automationVersions.id, p.versionId)).limit(1);
  if (!version || version.workspaceId !== p.workspaceId) throw new Error("Automation version not found");
  const graph = automationGraph.parse(version.graph);
  const trigger = graph.nodes.find((n) => n.type === "trigger");
  if (!trigger) throw new Error("Flow has no trigger");

  const [exec] = await db
    .insert(automationExecutions)
    .values({
      workspaceId: p.workspaceId,
      automationId: p.automationId,
      versionId: p.versionId,
      contactId: p.contactId,
      conversationId: p.conversationId,
      inboundEventId: p.inboundEventId ?? null,
      mode: p.mode,
      status: "queued",
      input: p.input,
      state: initialState(trigger.id, p.input, p.redirectDepth ?? 0, p.vars),
      retryOf: p.retryOf ?? null,
      attempt: 1,
    })
    .returning();
  return runExecution(exec!.id);
}

/**
 * Runs (or resumes) an execution. Safe to call concurrently and repeatedly:
 * a per-execution lock serialises work and stale resume tokens are ignored,
 * so the same event or job never executes a step twice.
 */
export function runExecution(executionId: string, resume?: ResumeInput): Promise<Execution> {
  return withLock(executionId, () => runLocked(executionId, resume));
}

/** Starts a fresh run with the same input as a failed one. */
export async function retryExecution(workspaceId: string, executionId: string): Promise<Execution> {
  const db = await getDb();
  const [old] = await db
    .select()
    .from(automationExecutions)
    .where(and(eq(automationExecutions.id, executionId), eq(automationExecutions.workspaceId, workspaceId)))
    .limit(1);
  if (!old) throw new Error("Execution not found");
  if (old.status !== "failed") throw new Error("Only failed runs can be retried");
  return startExecution({
    workspaceId,
    automationId: old.automationId,
    versionId: old.versionId,
    conversationId: old.conversationId,
    contactId: old.contactId,
    mode: old.mode,
    input: { ...(old.input as ExecutionInput), source: "retry" },
    retryOf: old.id,
  });
}

// ─── Interpreter ────────────────────────────────────────────────────────────

async function runLocked(executionId: string, resume?: ResumeInput): Promise<Execution> {
  const db = await getDb();
  const [exec] = await db.select().from(automationExecutions).where(eq(automationExecutions.id, executionId)).limit(1);
  if (!exec) throw new Error("Execution not found");
  if (exec.status !== "queued" && exec.status !== "waiting") return exec; // already finished

  const state = structuredClone(exec.state as ExecState);
  const [version] = await db.select().from(automationVersions).where(eq(automationVersions.id, exec.versionId)).limit(1);
  const graph = automationGraph.parse(version!.graph);
  const maxSteps = graph.settings.maxSteps;
  let stepCount = exec.stepCount;

  if (exec.status === "waiting") {
    // Only the holder of the current wait token may resume; anything else is a stale/duplicate job or event.
    if (!resume || !state.wait || resume.token !== state.wait.token) return exec;
    await applyResume(exec, graph, state, resume);
  }

  await db
    .update(automationExecutions)
    .set({ status: "running", startedAt: exec.startedAt ?? new Date(), updatedAt: new Date() })
    .where(eq(automationExecutions.id, exec.id));

  while (state.cursor) {
    const node = graph.nodes.find((n) => n.id === state.cursor);
    if (!node) return fail(exec, state, stepCount, `Node ${state.cursor} no longer exists in this version`, state.cursor);
    if (stepCount >= maxSteps) {
      return fail(exec, state, stepCount, `Stopped after ${maxSteps} steps — the flow is probably looping`, node.id);
    }

    const started = new Date();
    const t0 = performance.now();
    let result: StepResult;
    try {
      result = await withTimeout(executeNode(exec, graph, node, state), NODE_TIMEOUT_MS[node.type] ?? DEFAULT_NODE_TIMEOUT_MS, node.type);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const durationMs = Math.round(performance.now() - t0);
      stepCount++;
      if (err instanceof RetryableError && state.retries < MAX_RETRIES) {
        state.retries++;
        const token = randomUUID();
        const resumeAt = new Date(Date.now() + 2 ** state.retries * 2_000);
        state.wait = { kind: "retry", nodeId: node.id, token, resumeAt: resumeAt.toISOString() };
        await insertLog(exec, state, node, { status: "failed", startedAt: started, durationMs, error: `${message} — retrying (${state.retries}/${MAX_RETRIES})` });
        await enqueueJob({ workspaceId: exec.workspaceId, kind: "execution.resume", payload: { executionId: exec.id, token, reason: "retry" }, runAt: resumeAt, dedupeKey: `resume:${token}` });
        return saveExec(exec.id, { status: "waiting", state, stepCount, currentNodeId: node.id });
      }
      await insertLog(exec, state, node, { status: "failed", startedAt: started, durationMs, error: message });
      return fail(exec, state, stepCount, message, node.id);
    }

    stepCount++;
    state.retries = 0;
    const durationMs = Math.round(performance.now() - t0);

    if (result.kind === "pause") {
      const token = randomUUID();
      state.wait = { ...result.wait, token, resumeAt: result.runAt?.toISOString() };
      await insertLog(exec, state, node, { status: "waiting", startedAt: started, durationMs, input: result.input, output: result.output });
      if (result.runAt) {
        await enqueueJob({
          workspaceId: exec.workspaceId,
          kind: "execution.resume",
          payload: { executionId: exec.id, token, reason: result.wait.kind === "reply" ? "reply_timeout" : "delay" },
          runAt: result.runAt,
          dedupeKey: `resume:${token}`,
        });
      }
      return saveExec(exec.id, { status: "waiting", state, stepCount, currentNodeId: node.id });
    }

    if (result.kind === "end") {
      await insertLog(exec, state, node, { status: "success", startedAt: started, durationMs, input: result.input, output: result.output });
      state.cursor = null;
      return complete(exec, state, stepCount, { outcome: result.outcome, label: result.label ?? "", endNodeId: node.id });
    }

    const handle = result.handle ?? "out";
    await insertLog(exec, state, node, { status: "success", startedAt: started, durationMs, branch: handle === "out" ? null : handle, input: result.input, output: result.output });
    const next = nextNode(graph, node.id, handle);
    if (!next) return fail(exec, state, stepCount, `${node.type} node has no connection for its “${handle}” output`, node.id);
    state.cursor = next;
    await saveExec(exec.id, { state, stepCount, currentNodeId: next });
  }

  return complete(exec, state, stepCount, { outcome: "completed", label: "" });
}

const nextNode = (graph: AutomationGraph, nodeId: string, handle: string) =>
  graph.edges.find((e) => e.source === nodeId && e.sourceHandle === handle)?.target ?? null;

/** Applies a valid resume to the state: records how the paused node finished and moves the cursor. */
async function applyResume(exec: Execution, graph: AutomationGraph, state: ExecState, resume: ResumeInput) {
  const wait = state.wait!;
  const node = graph.nodes.find((n) => n.id === wait.nodeId);
  delete state.wait;
  if (!node) {
    state.cursor = wait.nodeId; // the loop reports the missing node
    return;
  }
  const finish = async (output: unknown) => {
    await insertLog(exec, state, node, { status: "success", startedAt: new Date(), durationMs: 0, output });
    state.cursor = nextNode(graph, node.id, "out");
  };
  switch (resume.reason) {
    case "delay":
      if (wait.phase === "before_send") {
        state.delayDone = [...state.delayDone, node.id];
        state.cursor = node.id; // re-enter the message node, which now sends
      } else {
        await finish({ waited: true });
      }
      return;
    case "retry":
      state.cursor = node.id;
      return;
    case "reply":
      state.message = resume.text;
      if (wait.saveAs) state.vars[wait.saveAs] = resume.text;
      await finish({ reply: resume.text });
      return;
    case "reply_timeout":
      state.message = "";
      if (wait.saveAs) state.vars[wait.saveAs] = "";
      await finish({ timedOut: true, reply: "" });
      return;
  }
}

// ─── Node handlers ──────────────────────────────────────────────────────────

async function scopeFor(exec: Execution, state: ExecState): Promise<EvalScope> {
  const parts = await loadScopeParts(exec.workspaceId, exec.contactId);
  return { ...parts, message: state.message, vars: state.vars };
}

async function executeNode(exec: Execution, graph: AutomationGraph, node: GraphNode, state: ExecState): Promise<StepResult> {
  switch (node.type) {
    case "trigger":
      return { kind: "next", input: { text: state.message || undefined, event: (exec.input as ExecutionInput).eventName }, output: { started: true } };
    case "message":
      return messageStep(exec, node, node.data as MessageConfig, state);
    case "condition": {
      const scope = await scopeFor(exec, state);
      const { result, rules } = evaluateCondition(node.data as ConditionConfig, scope);
      return { kind: "next", handle: result ? "true" : "false", input: { message: scope.message, tags: scope.tags }, output: { result, rules } };
    }
    case "action":
      return actionStep(exec, node, (node.data as { action: ActionDef }).action, state);
    case "ai_response":
      return aiStep(exec, node, node.data as AiResponseConfig, state);
    case "end": {
      const d = node.data as EndConfig;
      if (d.outcome === "handoff") await handoff(exec, "Flow ended with a hand-off to a human");
      return { kind: "end", outcome: d.outcome, label: d.label, output: { outcome: d.outcome, label: d.label } };
    }
    case "note":
      throw new Error("Notes are annotations and can't be executed");
  }
}

async function messageStep(exec: Execution, node: GraphNode, d: MessageConfig, state: ExecState): Promise<StepResult> {
  if (d.delaySeconds > 0 && !state.delayDone.includes(node.id)) {
    const runAt = new Date(Date.now() + d.delaySeconds * 1000);
    return { kind: "pause", wait: { kind: "delay", nodeId: node.id, phase: "before_send" }, runAt, output: { delayedUntil: runAt.toISOString() } };
  }
  state.delayDone = state.delayDone.filter((id) => id !== node.id); // loops re-apply the delay
  if (!exec.conversationId) throw new Error("No conversation to send the message to");
  const db = await getDb();
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, exec.conversationId)).limit(1);
  if (!conv) throw new Error("Conversation not found");
  const provider = getChannelProvider(conv.channel);
  const scope = await scopeFor(exec, state);
  const sent = [];
  for (const [i, m] of d.messages.entries()) {
    const last = i === d.messages.length - 1;
    const text = renderTemplate(m.text, scope);
    const res = await provider.sendMessage(
      { workspaceId: exec.workspaceId, conversationId: conv.id, contactId: exec.contactId, recipientId: null, executionId: exec.id, source: "automation" },
      {
        text,
        quickReplies: last ? d.quickReplies.map((q) => ({ id: q.id, label: renderTemplate(q.label, scope) })) : undefined,
        linkButtons: last ? d.linkButtons.map((b) => ({ ...b, label: renderTemplate(b.label, scope) })) : undefined,
      },
    );
    if (res.status === "failed") throw new RetryableError(res.error ?? "Channel failed to deliver the message");
    sent.push({ text, status: res.status });
  }
  if (d.waitForReply) {
    const runAt = d.replyTimeoutSeconds > 0 ? new Date(Date.now() + d.replyTimeoutSeconds * 1000) : undefined;
    return { kind: "pause", wait: { kind: "reply", nodeId: node.id, saveAs: d.saveReplyAs || undefined }, runAt, output: { sent, waitingForReply: true } };
  }
  return { kind: "next", output: { sent } };
}

async function actionStep(exec: Execution, node: GraphNode, a: ActionDef, state: ExecState): Promise<StepResult> {
  const ws = exec.workspaceId;
  const needContact = () => {
    if (!exec.contactId) throw new Error("This action needs a contact, but the run has none");
    return exec.contactId;
  };
  const scope = () => scopeFor(exec, state);
  switch (a.kind) {
    case "add_tag": {
      const tag = renderTemplate(a.tag, await scope());
      await addTagToContact(ws, needContact(), tag);
      return { kind: "next", output: { added: tag } };
    }
    case "remove_tag": {
      const tag = renderTemplate(a.tag, await scope());
      await removeTagFromContact(ws, needContact(), tag);
      return { kind: "next", output: { removed: tag } };
    }
    case "set_field": {
      const value = renderTemplate(a.value, await scope());
      await setContactField(ws, needContact(), a.field, value);
      state.vars[a.field] = value;
      return { kind: "next", output: { field: a.field, value } };
    }
    case "capture": {
      const source = a.source === "variable" ? state.vars[a.variable] ?? "" : state.message;
      const value = a.target === "email" ? extractEmail(source) : extractPhone(source);
      if (value) {
        await setContactField(ws, needContact(), a.target, value);
        state.vars[`captured_${a.target}`] = value;
      }
      return { kind: "next", input: { source }, output: { found: Boolean(value), value } };
    }
    case "wait": {
      const runAt = new Date(Date.now() + a.seconds * 1000);
      return { kind: "pause", wait: { kind: "delay", nodeId: node.id, phase: "after" }, runAt, output: { resumeAt: runAt.toISOString() } };
    }
    case "redirect": {
      if (state.redirectDepth >= MAX_REDIRECT_DEPTH) throw new Error(`Redirect limit (${MAX_REDIRECT_DEPTH}) reached — flows are redirecting in a loop`);
      const target = await redirectVersion(ws, a.automationId, exec.mode);
      const child = await startExecution({
        workspaceId: ws,
        automationId: a.automationId,
        versionId: target.versionId,
        conversationId: exec.conversationId,
        contactId: exec.contactId,
        mode: exec.mode,
        input: { text: state.message, source: "redirect" },
        redirectDepth: state.redirectDepth + 1,
        vars: { ...state.vars },
      });
      return { kind: "end", outcome: "redirected", label: `Redirected to “${target.name}”`, output: { childExecutionId: child.id, childStatus: child.status } };
    }
    case "log_event": {
      const s = await scope();
      const db = await getDb();
      const note = renderTemplate(a.note, s);
      await db.insert(activityEvents).values({
        workspaceId: ws,
        type: "flow.event",
        summary: `Flow event “${a.eventName}”${note ? `: ${note}` : ""}`.slice(0, 300),
        entityType: "execution",
        entityId: exec.id,
        metadata: { eventName: a.eventName, note, automationId: exec.automationId, mode: exec.mode },
      });
      return { kind: "next", output: { eventName: a.eventName, note } };
    }
    case "mark_qualified":
      await setContactField(ws, needContact(), "lead_status", "qualified");
      return { kind: "next", output: { leadStatus: "qualified" } };
  }
}

async function redirectVersion(workspaceId: string, automationId: string, mode: "test" | "live") {
  const db = await getDb();
  const [target] = await db
    .select()
    .from(automations)
    .where(and(eq(automations.id, automationId), eq(automations.workspaceId, workspaceId)))
    .limit(1);
  if (!target) throw new Error("The redirect target automation no longer exists");
  if (target.publishedVersionId && (mode === "live" ? target.status === "active" : true)) {
    return { versionId: target.publishedVersionId, name: target.name };
  }
  if (mode === "live") throw new Error(`Redirect target “${target.name}” is not active`);
  // Test runs may redirect into an unpublished draft: snapshot it.
  const { snapshotDraftForTest } = await import("./snapshots");
  const versionId = await snapshotDraftForTest(workspaceId, target);
  return { versionId, name: target.name };
}

async function aiStep(exec: Execution, node: GraphNode, d: AiResponseConfig, state: ExecState): Promise<StepResult> {
  const scope = await scopeFor(exec, state);
  const res = await runAiStep({ execution: exec, config: d, scope });
  if (d.saveReplyAs && res.reply) state.vars[d.saveReplyAs] = res.reply;
  if (res.handoff) await handoff(exec, res.handoffReason ?? "AI agent requested a human");
  return { kind: "next", input: { message: scope.message }, output: res };
}

async function handoff(exec: Execution, reason: string) {
  if (!exec.conversationId) return;
  const db = await getDb();
  await db.update(conversations).set({ status: "needs_human", updatedAt: new Date() }).where(eq(conversations.id, exec.conversationId));
  await db.insert(notifications).values({
    workspaceId: exec.workspaceId,
    type: "handoff",
    title: exec.mode === "test" ? "Test conversation needs a human" : "Conversation needs a human",
    body: reason,
    link: `/conversations?c=${exec.conversationId}`,
  });
}

// ─── Persistence helpers ────────────────────────────────────────────────────

async function insertLog(
  exec: Execution,
  state: ExecState,
  node: GraphNode,
  log: { status: "success" | "failed" | "waiting" | "skipped"; startedAt: Date; durationMs: number; input?: unknown; output?: unknown; error?: string; branch?: string | null },
) {
  const db = await getDb();
  await db.insert(nodeExecutionLogs).values({
    workspaceId: exec.workspaceId,
    executionId: exec.id,
    seq: state.seq++,
    nodeId: node.id,
    nodeType: node.type,
    status: log.status,
    input: log.input ?? null,
    output: log.output ?? null,
    branch: log.branch ?? null,
    error: log.error ?? null,
    startedAt: log.startedAt,
    finishedAt: log.status === "waiting" ? null : new Date(),
    durationMs: log.durationMs,
  });
}

async function saveExec(id: string, patch: Partial<typeof automationExecutions.$inferInsert> & { state: ExecState }) {
  const db = await getDb();
  const [row] = await db
    .update(automationExecutions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(automationExecutions.id, id))
    .returning();
  return row!;
}

async function complete(exec: Execution, state: ExecState, stepCount: number, result: Record<string, unknown>) {
  const row = await saveExec(exec.id, { status: "completed", state, stepCount, result, currentNodeId: null, finishedAt: new Date() });
  logger.info("execution.completed", { executionId: exec.id, automationId: exec.automationId, mode: exec.mode, steps: stepCount });
  return row;
}

async function fail(exec: Execution, state: ExecState, stepCount: number, error: string, nodeId: string | null) {
  delete state.wait;
  const row = await saveExec(exec.id, { status: "failed", state, stepCount, error, errorNodeId: nodeId, finishedAt: new Date() });
  logger.warn("execution.failed", { executionId: exec.id, automationId: exec.automationId, mode: exec.mode, nodeId, error });
  if (exec.mode === "live") await recordLiveFailure(exec, error);
  return row;
}

/** Live failures surface on the automation; repeated ones move it to the `error` state. */
async function recordLiveFailure(exec: Execution, error: string) {
  const db = await getDb();
  const recent = await db
    .select({ status: automationExecutions.status })
    .from(automationExecutions)
    .where(and(eq(automationExecutions.automationId, exec.automationId), eq(automationExecutions.mode, "live"), sql`${automationExecutions.status} in ('completed','failed')`))
    .orderBy(desc(automationExecutions.createdAt))
    .limit(CONSECUTIVE_LIVE_FAILURES_FOR_ERROR);
  const allFailed = recent.length === CONSECUTIVE_LIVE_FAILURES_FOR_ERROR && recent.every((r) => r.status === "failed");
  await db
    .update(automations)
    .set({ lastError: error.slice(0, 500), ...(allFailed ? { status: "error" as const } : {}), updatedAt: new Date() })
    .where(eq(automations.id, exec.automationId));
}

async function withTimeout<T>(p: Promise<T>, ms: number, nodeType: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new NodeTimeoutError(nodeType, ms)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
