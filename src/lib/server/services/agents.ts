import "server-only";
import { queryRows } from "@/lib/server/db/rows";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { aiAgents, knowledgeEntries, knowledgeSources, unansweredQuestions } from "@/lib/server/db/schema";
import type { WorkspaceContext } from "@/lib/server/auth/context";
import { notFound, validationError } from "@/lib/server/errors";
import { buildSearchQuery, chunkText } from "@/lib/domain/knowledge";
import { recordActivity } from "./activity";

export type Agent = typeof aiAgents.$inferSelect;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;

const DEFAULT_FALLBACK = "I'm not sure about that one — let me get a member of our team to help you.";

const roleDefaults: Record<Agent["role"], string> = {
  general: "You are a helpful assistant for this business. Answer questions clearly and briefly.",
  support:
    "You are a customer support agent. Resolve questions using the knowledge base, be empathetic, and offer a human when you can't help.",
  sales:
    "You are a friendly sales assistant. Help people find the right product, answer questions about offers from the knowledge base, and guide them to the next step.",
};

// ─── Agents ─────────────────────────────────────────────────────────────────

export async function listAgentOptions(ctx: WorkspaceContext) {
  const db = await getDb();
  return db
    .select({ id: aiAgents.id, name: aiAgents.name })
    .from(aiAgents)
    .where(eq(aiAgents.workspaceId, ctx.workspaceId))
    .orderBy(asc(aiAgents.name));
}

export async function listAgents(ctx: WorkspaceContext) {
  const db = await getDb();
  const agents = await db.select().from(aiAgents).where(eq(aiAgents.workspaceId, ctx.workspaceId)).orderBy(desc(aiAgents.updatedAt));
  if (!agents.length) return [];
  const ids = agents.map((a) => a.id);
  const [sources, unanswered] = await Promise.all([
    db.select({ agentId: knowledgeSources.agentId, n: count() }).from(knowledgeSources).where(inArray(knowledgeSources.agentId, ids)).groupBy(knowledgeSources.agentId),
    db
      .select({ agentId: unansweredQuestions.agentId, n: count() })
      .from(unansweredQuestions)
      .where(and(inArray(unansweredQuestions.agentId, ids), isNull(unansweredQuestions.resolvedAt)))
      .groupBy(unansweredQuestions.agentId),
  ]);
  const s = new Map(sources.map((r) => [r.agentId, r.n]));
  const u = new Map(unanswered.map((r) => [r.agentId, r.n]));
  return agents.map((a) => ({ ...a, sourceCount: s.get(a.id) ?? 0, unansweredCount: u.get(a.id) ?? 0 }));
}

export async function getAgent(ctx: WorkspaceContext, id: string): Promise<Agent> {
  const db = await getDb();
  const [row] = await db.select().from(aiAgents).where(and(eq(aiAgents.id, id), eq(aiAgents.workspaceId, ctx.workspaceId))).limit(1);
  if (!row) throw notFound("AI agent");
  return row;
}

export async function createAgent(ctx: WorkspaceContext, input: { name: string; role: Agent["role"]; description: string }) {
  const db = await getDb();
  const [row] = await db
    .insert(aiAgents)
    .values({
      workspaceId: ctx.workspaceId,
      name: input.name,
      role: input.role,
      description: input.description,
      instructions: roleDefaults[input.role],
      fallbackResponse: DEFAULT_FALLBACK,
      escalationRules: { keywords: [], onNoAnswer: false, onExplicitRequest: true },
    })
    .returning();
  await recordActivity(ctx, { type: "agent.created", summary: `AI agent “${row!.name}” created`, entityType: "agent", entityId: row!.id });
  return row!;
}

export async function updateAgent(ctx: WorkspaceContext, id: string, patch: Partial<typeof aiAgents.$inferInsert>) {
  await getAgent(ctx, id);
  const db = await getDb();
  const { workspaceId: _w, id: _i, ...safe } = patch;
  void _w;
  void _i;
  await db
    .update(aiAgents)
    .set({ ...safe, updatedAt: new Date() })
    .where(and(eq(aiAgents.id, id), eq(aiAgents.workspaceId, ctx.workspaceId)));
}

export async function deleteAgent(ctx: WorkspaceContext, id: string) {
  const agent = await getAgent(ctx, id);
  const db = await getDb();
  await db.delete(aiAgents).where(and(eq(aiAgents.id, id), eq(aiAgents.workspaceId, ctx.workspaceId)));
  await recordActivity(ctx, { type: "agent.deleted", summary: `AI agent “${agent.name}” deleted`, entityType: "agent" });
}

// ─── Knowledge ──────────────────────────────────────────────────────────────

export async function listKnowledgeSources(ctx: WorkspaceContext, agentId: string, q?: string) {
  await getAgent(ctx, agentId);
  const db = await getDb();
  const term = q?.trim();
  return db
    .select()
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.workspaceId, ctx.workspaceId),
        eq(knowledgeSources.agentId, agentId),
        term
          ? sql`(${knowledgeSources.title} ilike ${"%" + term + "%"} or ${knowledgeSources.content} ilike ${"%" + term + "%"} or ${knowledgeSources.question} ilike ${"%" + term + "%"})`
          : undefined,
      ),
    )
    .orderBy(desc(knowledgeSources.updatedAt));
}

/** (Re)builds the searchable chunks for one source. */
async function reindexSource(source: KnowledgeSource) {
  const db = await getDb();
  await db.delete(knowledgeEntries).where(eq(knowledgeEntries.sourceId, source.id));
  const body =
    source.type === "qa" ? `Q: ${source.question}\nA: ${source.answer}` : `${source.title}\n\n${source.content}`;
  const chunks = source.type === "qa" ? [body] : chunkText(body);
  if (chunks.length) {
    await db.insert(knowledgeEntries).values(
      chunks.map((content, i) => ({ workspaceId: source.workspaceId, agentId: source.agentId, sourceId: source.id, chunkIndex: i, content })),
    );
  }
}

export async function addKnowledgeText(ctx: WorkspaceContext, agentId: string, input: { title: string; content: string; fileName?: string; mimeType?: string }) {
  await getAgent(ctx, agentId);
  const db = await getDb();
  const [source] = await db
    .insert(knowledgeSources)
    .values({
      workspaceId: ctx.workspaceId,
      agentId,
      type: input.fileName ? "file" : "text",
      title: input.title,
      content: input.content,
      fileName: input.fileName ?? null,
      mimeType: input.mimeType ?? null,
    })
    .returning();
  await reindexSource(source!);
  return source!;
}

export async function addKnowledgeQa(ctx: WorkspaceContext, agentId: string, input: { question: string; answer: string }) {
  await getAgent(ctx, agentId);
  const db = await getDb();
  const [source] = await db
    .insert(knowledgeSources)
    .values({ workspaceId: ctx.workspaceId, agentId, type: "qa", title: input.question.slice(0, 120), question: input.question, answer: input.answer })
    .returning();
  await reindexSource(source!);
  return source!;
}

async function getSource(ctx: WorkspaceContext, sourceId: string) {
  const db = await getDb();
  const [s] = await db
    .select()
    .from(knowledgeSources)
    .where(and(eq(knowledgeSources.id, sourceId), eq(knowledgeSources.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!s) throw notFound("Knowledge source");
  return s;
}

export async function updateKnowledgeSource(
  ctx: WorkspaceContext,
  sourceId: string,
  input: { title?: string; content?: string; question?: string; answer?: string },
) {
  const s = await getSource(ctx, sourceId);
  if (s.type === "qa" && (input.question === undefined || input.answer === undefined)) throw validationError("Question and answer are required");
  const db = await getDb();
  const [updated] = await db
    .update(knowledgeSources)
    .set(
      s.type === "qa"
        ? { question: input.question, answer: input.answer, title: input.question!.slice(0, 120), updatedAt: new Date() }
        : { title: input.title ?? s.title, content: input.content ?? s.content, updatedAt: new Date() },
    )
    .where(eq(knowledgeSources.id, s.id))
    .returning();
  await reindexSource(updated!);
  return updated!;
}

export async function deleteKnowledgeSource(ctx: WorkspaceContext, sourceId: string) {
  const s = await getSource(ctx, sourceId);
  const db = await getDb();
  await db.delete(knowledgeSources).where(eq(knowledgeSources.id, s.id));
}

export type RetrievedChunk = { sourceId: string; title: string; type: KnowledgeSource["type"]; content: string; answer: string | null; rank: number };

/**
 * Full-text retrieval over an agent's knowledge (Postgres `simple` config,
 * OR of question terms, ranked by ts_rank_cd). Workspace-scoped.
 */
export async function searchKnowledge(workspaceId: string, agentId: string, question: string, limit = 4): Promise<RetrievedChunk[]> {
  const tsq = buildSearchQuery(question);
  if (!tsq) return [];
  const db = await getDb();
  const rows = await queryRows<{ source_id: string; title: string; type: KnowledgeSource["type"]; content: string; answer: string | null; rank: number }>(db, sql`
    select e.source_id, s.title, s.type, e.content, s.answer, ts_rank_cd(e.search, q) as rank
      from knowledge_entries e
      join knowledge_sources s on s.id = e.source_id
      cross join to_tsquery('simple', ${tsq}) q
     where e.workspace_id = ${workspaceId} and e.agent_id = ${agentId} and e.search @@ q
     order by rank desc
     limit ${limit}`);
  return rows.map((r) => ({ sourceId: r.source_id, title: r.title, type: r.type, content: r.content, answer: r.answer, rank: Number(r.rank) }));
}

// ─── Unanswered questions ───────────────────────────────────────────────────

export async function recordUnanswered(workspaceId: string, agentId: string, question: string, conversationId: string | null) {
  const db = await getDb();
  await db.insert(unansweredQuestions).values({ workspaceId, agentId, question: question.slice(0, 1000), conversationId });
}

export async function listUnanswered(ctx: WorkspaceContext, agentId: string) {
  await getAgent(ctx, agentId);
  const db = await getDb();
  return db
    .select()
    .from(unansweredQuestions)
    .where(and(eq(unansweredQuestions.workspaceId, ctx.workspaceId), eq(unansweredQuestions.agentId, agentId)))
    .orderBy(asc(sql`${unansweredQuestions.resolvedAt} is not null`), desc(unansweredQuestions.createdAt))
    .limit(200);
}

/** Resolves a question, optionally turning it into a Q&A knowledge entry. */
export async function resolveUnanswered(ctx: WorkspaceContext, id: string, answer?: string) {
  const db = await getDb();
  const [q] = await db
    .select()
    .from(unansweredQuestions)
    .where(and(eq(unansweredQuestions.id, id), eq(unansweredQuestions.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!q) throw notFound("Question");
  if (answer?.trim()) await addKnowledgeQa(ctx, q.agentId, { question: q.question, answer: answer.trim() });
  await db.update(unansweredQuestions).set({ resolvedAt: new Date() }).where(eq(unansweredQuestions.id, id));
}
