import { z } from "zod";

/**
 * Automation graph format (schema version 1).
 *
 * Pure and framework-free: used by the builder (client), the validator,
 * the execution engine (server) and the AI generator. Never `eval` anything
 * from a graph — node configs are plain data interpreted by the engine.
 */

export const GRAPH_SCHEMA_VERSION = 1;

const id = z.string().min(1).max(64);
const shortText = (max = 200) => z.string().trim().max(max);
const list = <T extends z.ZodType>(item: T, max = 50) => z.array(item).max(max);
const keyword = z.string().trim().min(1, "Keyword can't be empty").max(100);

/** Variable / field names used in {{...}} templates and contact fields. */
export const fieldName = z
  .string()
  .trim()
  .min(1, "Field name is required")
  .max(64)
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Use letters, numbers and underscores (e.g. course_interest)");

// ─── Trigger ────────────────────────────────────────────────────────────────

export const triggerKinds = ["manual", "incoming_message", "keyword", "phrase", "webhook"] as const;
export type TriggerKind = (typeof triggerKinds)[number];

export const triggerConfig = z.object({
  kind: z.enum(triggerKinds),
  /** keyword: any of these words appears as a whole word. */
  keywords: list(keyword).default([]),
  /** phrase: message matches a phrase per `phraseMatch`. */
  phrases: list(shortText(300).min(1, "Phrase can't be empty")).default([]),
  phraseMatch: z.enum(["exact", "contains", "starts_with"]).default("contains"),
  caseSensitive: z.boolean().default(false),
  /** webhook: generic event name for future integrations. */
  eventName: shortText(100).default(""),
  /** Sample input used by the builder's test runner. */
  sampleInput: shortText(1000).default(""),
});
export type TriggerConfig = z.infer<typeof triggerConfig>;

// ─── Message ────────────────────────────────────────────────────────────────

export const messageConfig = z.object({
  messages: list(z.object({ id, text: shortText(2000) }), 10).min(1, "Add at least one message"),
  quickReplies: list(z.object({ id, label: shortText(40).min(1, "Button label is required") }), 10).default([]),
  linkButtons: list(
    z.object({
      id,
      label: shortText(40).min(1, "Button label is required"),
      url: z.url({ protocol: /^https?$/, error: "Enter a valid http(s) URL" }),
    }),
    3,
  ).default([]),
  /** Seconds to wait before sending (executed via the job queue, never by sleeping). */
  delaySeconds: z.number().int().min(0).max(7 * 24 * 3600).default(0),
  /** Pause the run until the contact replies; the reply is stored in `saveReplyAs`. */
  waitForReply: z.boolean().default(false),
  saveReplyAs: fieldName.or(z.literal("")).default(""),
  /** How long to wait for a reply before continuing anyway. 0 = wait forever (until run expiry). */
  replyTimeoutSeconds: z.number().int().min(0).max(30 * 24 * 3600).default(0),
});
export type MessageConfig = z.infer<typeof messageConfig>;

// ─── Condition ──────────────────────────────────────────────────────────────

export const compareOperators = ["equals", "not_equals", "contains", "is_empty", "is_not_empty"] as const;
export type CompareOperator = (typeof compareOperators)[number];

export const conditionRule = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("message_contains"), keywords: list(keyword).min(1, "Add at least one keyword"), caseSensitive: z.boolean().default(false) }),
  z.object({ kind: z.literal("variable"), variable: fieldName, operator: z.enum(compareOperators), value: shortText(500).default("") }),
  z.object({ kind: z.literal("has_tag"), tag: shortText(50).min(1, "Choose a tag") }),
  z.object({ kind: z.literal("contact_field"), field: fieldName, operator: z.enum(compareOperators), value: shortText(500).default("") }),
]);
export type ConditionRule = z.infer<typeof conditionRule>;

export const conditionConfig = z.object({
  rules: list(conditionRule, 10).min(1, "Add at least one rule"),
  combinator: z.enum(["all", "any"]).default("all"),
});
export type ConditionConfig = z.infer<typeof conditionConfig>;

// ─── Action ─────────────────────────────────────────────────────────────────

export const actionDef = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add_tag"), tag: shortText(50).min(1, "Tag is required") }),
  z.object({ kind: z.literal("remove_tag"), tag: shortText(50).min(1, "Tag is required") }),
  z.object({ kind: z.literal("set_field"), field: fieldName, value: shortText(500) }),
  z.object({
    kind: z.literal("capture"),
    target: z.enum(["email", "phone"]),
    /** Where to read from; defaults to the latest inbound message. */
    source: z.enum(["last_message", "variable"]).default("last_message"),
    variable: fieldName.or(z.literal("")).default(""),
  }),
  z.object({ kind: z.literal("wait"), seconds: z.number().int().min(1, "Wait at least 1 second").max(30 * 24 * 3600) }),
  z.object({ kind: z.literal("redirect"), automationId: z.uuid("Choose an automation") }),
  z.object({ kind: z.literal("log_event"), eventName: shortText(100).min(1, "Event name is required"), note: shortText(500).default("") }),
  z.object({ kind: z.literal("mark_qualified") }),
]);
export type ActionDef = z.infer<typeof actionDef>;
export const actionConfig = z.object({ action: actionDef });
export type ActionConfig = z.infer<typeof actionConfig>;

// ─── AI response ────────────────────────────────────────────────────────────

export const aiResponseConfig = z.object({
  agentId: z.uuid("Choose an AI agent"),
  instructions: shortText(2000).default(""),
  /** Extra context appended to retrieval (e.g. "Only discuss the beginner course"). */
  knowledgeContext: shortText(2000).default(""),
  fallback: z.enum(["agent_default", "custom_message", "handoff"]).default("agent_default"),
  fallbackMessage: shortText(1000).default(""),
  saveReplyAs: fieldName.or(z.literal("")).default(""),
});
export type AiResponseConfig = z.infer<typeof aiResponseConfig>;

// ─── Note & End ─────────────────────────────────────────────────────────────

export const noteConfig = z.object({
  text: shortText(2000).default(""),
  color: z.enum(["yellow", "blue", "green", "pink", "gray"]).default("yellow"),
});
export type NoteConfig = z.infer<typeof noteConfig>;

export const endConfig = z.object({
  outcome: z.enum(["completed", "goal_reached", "handoff"]).default("completed"),
  label: shortText(100).default(""),
});
export type EndConfig = z.infer<typeof endConfig>;

// ─── Nodes, edges, graph ────────────────────────────────────────────────────

export const nodeConfigSchemas = {
  trigger: triggerConfig,
  message: messageConfig,
  condition: conditionConfig,
  action: actionConfig,
  ai_response: aiResponseConfig,
  note: noteConfig,
  end: endConfig,
} as const;

export type NodeType = keyof typeof nodeConfigSchemas;
export const nodeTypes = Object.keys(nodeConfigSchemas) as NodeType[];

export type NodeConfigMap = { [K in NodeType]: z.infer<(typeof nodeConfigSchemas)[K]> };

const position = z.object({ x: z.number().finite(), y: z.number().finite() });

/**
 * Loose node shape: `data` is validated per type by the validator so that a
 * draft with an invalid config can still be saved and edited.
 */
export const graphNode = z.object({
  id,
  type: z.enum(nodeTypes as [NodeType, ...NodeType[]]),
  position,
  data: z.record(z.string(), z.unknown()),
  /** Optional builder-only display name. */
  label: shortText(80).optional(),
});
export type GraphNode = z.infer<typeof graphNode>;

export type TypedNode<T extends NodeType = NodeType> = Omit<GraphNode, "type" | "data"> & {
  type: T;
  data: NodeConfigMap[T];
};

export const graphEdge = z.object({
  id,
  source: id,
  target: id,
  /** Output handle on the source node: "out", or "true"/"false" for conditions. */
  sourceHandle: z.enum(["out", "true", "false"]).default("out"),
});
export type GraphEdge = z.infer<typeof graphEdge>;

export const graphSettings = z.object({
  /** Hard cap on node executions per run (loop protection). */
  maxSteps: z.number().int().min(1).max(500).default(100),
});

export const automationGraph = z.object({
  schemaVersion: z.literal(GRAPH_SCHEMA_VERSION).default(GRAPH_SCHEMA_VERSION),
  nodes: z.array(graphNode).max(200, "A flow can have at most 200 nodes"),
  edges: z.array(graphEdge).max(400),
  settings: graphSettings.default({ maxSteps: 100 }),
});
export type AutomationGraph = z.infer<typeof automationGraph>;

/** Output handles each node type exposes. */
export const outputHandles: Record<NodeType, readonly ("out" | "true" | "false")[]> = {
  trigger: ["out"],
  message: ["out"],
  condition: ["true", "false"],
  action: ["out"],
  ai_response: ["out"],
  note: [],
  end: [],
};

export const hasInput = (type: NodeType) => type !== "trigger" && type !== "note";
