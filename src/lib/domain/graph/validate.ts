import {
  automationGraph,
  hasInput,
  nodeConfigSchemas,
  outputHandles,
  type AutomationGraph,
  type GraphNode,
  type NodeType,
} from "./schema";

export type IssueSeverity = "error" | "warning";
export type GraphIssue = {
  severity: IssueSeverity;
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  /** Config field path for node config errors, e.g. "messages.0.text". */
  path?: string;
};

export type ValidationResult = {
  /** True when there are no errors (warnings allowed). Required for activation. */
  valid: boolean;
  issues: GraphIssue[];
  /** Parsed graph with config defaults applied, when structurally parseable. */
  graph?: AutomationGraph;
};

/** External references the validator can check (e.g. agent ids in the workspace). */
export type ValidationContext = {
  agentIds?: ReadonlySet<string>;
  automationIds?: ReadonlySet<string>;
  /** Id of the automation being validated (redirecting to itself is a loop). */
  selfAutomationId?: string;
};

const handleLabel = (h: string) => (h === "out" ? "output" : `“${h}” output`);

export const nodeTypeLabels: Record<NodeType, string> = {
  trigger: "Trigger",
  message: "Message",
  condition: "Condition",
  action: "Action",
  ai_response: "AI response",
  note: "Note",
  end: "End",
};

export function nodeDisplayName(node: Pick<GraphNode, "type" | "label">) {
  return node.label?.trim() || nodeTypeLabels[node.type];
}

/**
 * Validates an automation graph. Pure: same input → same output.
 * Errors block activation; warnings are informational.
 */
export function validateGraph(input: unknown, ctx: ValidationContext = {}): ValidationResult {
  const parsed = automationGraph.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((i) => ({
        severity: "error",
        code: "invalid_structure",
        message: `Invalid flow structure at ${i.path.join(".") || "root"}: ${i.message}`,
      })),
    };
  }

  const graph = parsed.data;
  const issues: GraphIssue[] = [];
  const err = (code: string, message: string, extra: Partial<GraphIssue> = {}) =>
    issues.push({ severity: "error", code, message, ...extra });
  const warn = (code: string, message: string, extra: Partial<GraphIssue> = {}) =>
    issues.push({ severity: "warning", code, message, ...extra });

  // ── Node ids & per-node config ──
  const byId = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    if (byId.has(node.id)) err("duplicate_node_id", `Duplicate node id “${node.id}”`, { nodeId: node.id });
    byId.set(node.id, node);

    const schema = nodeConfigSchemas[node.type];
    const result = schema.safeParse(node.data);
    if (!result.success) {
      for (const i of result.error.issues) {
        err("invalid_config", `${nodeDisplayName(node)}: ${i.message}`, { nodeId: node.id, path: i.path.join(".") });
      }
    } else {
      node.data = result.data as Record<string, unknown>; // apply defaults
      checkSemantics(node, ctx, err, warn);
    }
  }

  // ── Trigger ──
  const triggers = graph.nodes.filter((n) => n.type === "trigger");
  if (triggers.length === 0) err("missing_trigger", "Add a Trigger node — every flow needs a starting point");
  if (triggers.length > 1) {
    for (const t of triggers.slice(1)) err("multiple_triggers", "A flow can only have one Trigger", { nodeId: t.id });
  }
  const executable = graph.nodes.filter((n) => n.type !== "note");
  if (!executable.some((n) => n.type === "end")) err("missing_end", "Add an End node so the flow can finish");

  // ── Edges ──
  const outgoing = new Map<string, Map<string, string>>(); // nodeId -> handle -> targetId
  const incoming = new Map<string, number>();
  const seenEdgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (seenEdgeIds.has(edge.id)) err("duplicate_edge_id", `Duplicate connection id “${edge.id}”`, { edgeId: edge.id });
    seenEdgeIds.add(edge.id);
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) {
      err("dangling_edge", "A connection points to a node that no longer exists", { edgeId: edge.id });
      continue;
    }
    if (source.type === "note" || target.type === "note") {
      err("note_connected", "Notes are annotations and can't be connected", { edgeId: edge.id, nodeId: source.type === "note" ? source.id : target.id });
      continue;
    }
    if (!outputHandles[source.type].includes(edge.sourceHandle)) {
      err("invalid_handle", `${nodeDisplayName(source)} has no ${handleLabel(edge.sourceHandle)}`, { edgeId: edge.id, nodeId: source.id });
      continue;
    }
    if (!hasInput(target.type)) {
      err("invalid_target", `${nodeDisplayName(target)} can't receive connections`, { edgeId: edge.id, nodeId: target.id });
      continue;
    }
    if (edge.source === edge.target) {
      err("self_loop", `${nodeDisplayName(source)} is connected to itself`, { edgeId: edge.id, nodeId: source.id });
      continue;
    }
    const handles = outgoing.get(edge.source) ?? new Map<string, string>();
    if (handles.has(edge.sourceHandle)) {
      err("multiple_outputs", `${nodeDisplayName(source)}: the ${handleLabel(edge.sourceHandle)} is connected more than once`, {
        edgeId: edge.id,
        nodeId: source.id,
      });
      continue;
    }
    handles.set(edge.sourceHandle, edge.target);
    outgoing.set(edge.source, handles);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }

  // ── Required outputs ──
  for (const node of executable) {
    for (const handle of outputHandles[node.type]) {
      if (!outgoing.get(node.id)?.has(handle)) {
        err("missing_connection", `${nodeDisplayName(node)}: connect the ${handleLabel(handle)} to the next step`, { nodeId: node.id });
      }
    }
  }

  // ── Reachability from the trigger ──
  const trigger = triggers[0];
  if (trigger) {
    const reachable = new Set<string>([trigger.id]);
    const queue = [trigger.id];
    while (queue.length) {
      const current = queue.shift()!;
      for (const next of outgoing.get(current)?.values() ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
    for (const node of executable) {
      if (!reachable.has(node.id)) {
        warn("unreachable", `${nodeDisplayName(node)} is not reachable from the Trigger and will never run`, { nodeId: node.id });
      }
    }
    if (!executable.some((n) => n.type === "end" && reachable.has(n.id)) && executable.some((n) => n.type === "end")) {
      err("end_unreachable", "No End node is reachable from the Trigger");
    }

    // ── Loops: every cycle must contain a pause, otherwise it would spin forever ──
    for (const cycle of findCycles(executable.map((n) => n.id), outgoing)) {
      const pauses = cycle.some((nid) => isPausingNode(byId.get(nid)!));
      const first = cycle[0]!;
      if (!pauses) {
        err("infinite_loop", "This loop has no wait step and would repeat forever. Add a Wait action or a message that waits for a reply.", {
          nodeId: first,
        });
      } else {
        warn("loop", "This flow contains a loop; runs stop after the step limit.", { nodeId: first });
      }
    }
  }

  return { valid: !issues.some((i) => i.severity === "error"), issues, graph };
}

function isPausingNode(node: GraphNode) {
  if (node.type === "message") return Boolean((node.data as { waitForReply?: boolean }).waitForReply) || Number((node.data as { delaySeconds?: number }).delaySeconds) > 0;
  if (node.type === "action") return (node.data as { action?: { kind?: string } }).action?.kind === "wait";
  return false;
}

/** Returns one representative node list per strongly connected component that forms a cycle. */
function findCycles(nodeIds: string[], outgoing: Map<string, Map<string, string>>): string[][] {
  // Tarjan's SCC
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result: string[][] = [];

  const strong = (v: string) => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const w of outgoing.get(v)?.values() ?? []) {
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, idx.get(w)!));
      }
    }
    if (low.get(v) === idx.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      if (component.length > 1) result.push(component);
    }
  };
  for (const v of nodeIds) if (!idx.has(v)) strong(v);
  return result;
}

type Report = (code: string, message: string, extra?: Partial<GraphIssue>) => void;

function checkSemantics(node: GraphNode, ctx: ValidationContext, err: Report, warn: Report) {
  const name = nodeDisplayName(node);
  switch (node.type) {
    case "trigger": {
      const d = node.data as { kind: string; keywords: string[]; phrases: string[]; eventName: string };
      if (d.kind === "keyword" && d.keywords.length === 0) err("trigger_keywords", `${name}: add at least one keyword`, { nodeId: node.id, path: "keywords" });
      if (d.kind === "phrase" && d.phrases.length === 0) err("trigger_phrases", `${name}: add at least one phrase`, { nodeId: node.id, path: "phrases" });
      if (d.kind === "webhook" && !d.eventName) err("trigger_event", `${name}: set an event name`, { nodeId: node.id, path: "eventName" });
      break;
    }
    case "message": {
      const d = node.data as { messages: { text: string }[]; quickReplies: unknown[]; waitForReply: boolean };
      d.messages.forEach((m, i) => {
        if (!m.text.trim()) err("empty_message", `${name}: message ${i + 1} is empty`, { nodeId: node.id, path: `messages.${i}.text` });
      });
      if (d.quickReplies.length > 0 && !d.waitForReply) {
        warn("quick_replies_no_wait", `${name}: quick replies are shown, but the flow won't wait for the answer`, { nodeId: node.id });
      }
      break;
    }
    case "action": {
      const a = (node.data as { action: { kind: string; automationId?: string; variable?: string; source?: string } }).action;
      if (a.kind === "redirect") {
        if (ctx.selfAutomationId && a.automationId === ctx.selfAutomationId) {
          err("redirect_self", `${name}: an automation can't redirect to itself`, { nodeId: node.id });
        } else if (ctx.automationIds && a.automationId && !ctx.automationIds.has(a.automationId)) {
          err("redirect_missing", `${name}: the target automation no longer exists`, { nodeId: node.id });
        }
      }
      if (a.kind === "capture" && a.source === "variable" && !a.variable) {
        err("capture_variable", `${name}: choose the variable to read from`, { nodeId: node.id });
      }
      break;
    }
    case "ai_response": {
      const d = node.data as { agentId: string; fallback: string; fallbackMessage: string };
      if (ctx.agentIds && !ctx.agentIds.has(d.agentId)) err("agent_missing", `${name}: the selected AI agent no longer exists`, { nodeId: node.id });
      if (d.fallback === "custom_message" && !d.fallbackMessage.trim()) {
        err("fallback_message", `${name}: write the fallback message`, { nodeId: node.id, path: "fallbackMessage" });
      }
      break;
    }
    default:
      break;
  }
}

/** Summary of the trigger, denormalised onto the automation row for fast matching. */
export function triggerSummary(graph: AutomationGraph): string | null {
  const trigger = graph.nodes.find((n) => n.type === "trigger");
  const kind = (trigger?.data as { kind?: string } | undefined)?.kind;
  return kind ?? null;
}
