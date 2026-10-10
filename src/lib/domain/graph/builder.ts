import {
  GRAPH_SCHEMA_VERSION,
  type ActionDef,
  type AutomationGraph,
  type ConditionRule,
  type GraphEdge,
  type GraphNode,
  type NodeConfigMap,
  type NodeType,
} from "./schema";

/**
 * Small fluent helper for authoring graphs in code (templates, defaults,
 * tests, the demo AI generator). Lays nodes out top-to-bottom automatically.
 */
export class GraphBuilder {
  private nodes: GraphNode[] = [];
  private edges: GraphEdge[] = [];
  private counter = 0;

  private add<T extends NodeType>(type: T, data: Partial<NodeConfigMap[T]>, opts: { id?: string; label?: string; x?: number; y?: number } = {}) {
    const id = opts.id ?? `${type}_${++this.counter}`;
    const row = this.nodes.length;
    this.nodes.push({
      id,
      type,
      label: opts.label,
      position: { x: opts.x ?? 0, y: opts.y ?? row * 140 },
      data: data as Record<string, unknown>,
    });
    return id;
  }

  trigger(data: Partial<NodeConfigMap["trigger"]>, opts?: { id?: string; label?: string; x?: number; y?: number }) {
    return this.add("trigger", { keywords: [], phrases: [], phraseMatch: "contains", caseSensitive: false, eventName: "", sampleInput: "", ...data }, opts);
  }

  message(texts: string | string[], extra: Partial<NodeConfigMap["message"]> = {}, opts?: { id?: string; label?: string; x?: number; y?: number }) {
    const list = Array.isArray(texts) ? texts : [texts];
    return this.add(
      "message",
      {
        messages: list.map((text, i) => ({ id: `m${i + 1}`, text })),
        quickReplies: [],
        linkButtons: [],
        delaySeconds: 0,
        waitForReply: false,
        saveReplyAs: "",
        replyTimeoutSeconds: 0,
        ...extra,
      },
      opts,
    );
  }

  condition(rules: ConditionRule[], combinator: "all" | "any" = "all", opts?: { id?: string; label?: string; x?: number; y?: number }) {
    return this.add("condition", { rules, combinator }, opts);
  }

  action(action: ActionDef, opts?: { id?: string; label?: string; x?: number; y?: number }) {
    return this.add("action", { action }, opts);
  }

  aiResponse(data: Partial<NodeConfigMap["ai_response"]> & { agentId: string }, opts?: { id?: string; label?: string; x?: number; y?: number }) {
    return this.add("ai_response", { instructions: "", knowledgeContext: "", fallback: "agent_default", fallbackMessage: "", saveReplyAs: "", ...data }, opts);
  }

  note(text: string, opts?: { id?: string; label?: string; x?: number; y?: number }) {
    return this.add("note", { text, color: "yellow" }, opts);
  }

  end(outcome: NodeConfigMap["end"]["outcome"] = "completed", label = "", opts?: { id?: string; label?: string; x?: number; y?: number }) {
    return this.add("end", { outcome, label }, opts);
  }

  connect(source: string, target: string, sourceHandle: GraphEdge["sourceHandle"] = "out") {
    this.edges.push({ id: `e_${source}_${sourceHandle}_${target}`, source, target, sourceHandle });
    return this;
  }

  /** Connects nodes in sequence via their default output. */
  chain(...ids: string[]) {
    for (let i = 0; i < ids.length - 1; i++) this.connect(ids[i]!, ids[i + 1]!);
    return this;
  }

  build(): AutomationGraph {
    return { schemaVersion: GRAPH_SCHEMA_VERSION, nodes: layout(this.nodes, this.edges), edges: this.edges, settings: { maxSteps: 100 } };
  }
}

/**
 * Simple layered layout: depth = longest path from the trigger (BFS order),
 * siblings spread horizontally. Notes keep their own position to the side.
 */
export function layout(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const depth = new Map<string, number>();
  const trigger = nodes.find((n) => n.type === "trigger");
  if (!trigger) return nodes;
  depth.set(trigger.id, 0);
  const queue = [trigger.id];
  const visits = new Map<string, number>();
  while (queue.length) {
    const id = queue.shift()!;
    const d = depth.get(id)!;
    for (const e of edges.filter((e) => e.source === id)) {
      const seen = visits.get(e.target) ?? 0;
      if (seen > nodes.length) continue; // cycles
      visits.set(e.target, seen + 1);
      if ((depth.get(e.target) ?? -1) < d + 1 && !isAncestor(e.target, id, edges)) {
        depth.set(e.target, d + 1);
        queue.push(e.target);
      }
    }
  }
  const rows = new Map<number, string[]>();
  for (const n of nodes) {
    if (n.type === "note" || !depth.has(n.id)) continue;
    const d = depth.get(n.id)!;
    rows.set(d, [...(rows.get(d) ?? []), n.id]);
  }
  const X_GAP = 320;
  const Y_GAP = 170;
  return nodes.map((n) => {
    if (n.type === "note") return { ...n, position: { x: 420, y: n.position.y } };
    const d = depth.get(n.id);
    if (d === undefined) return n;
    const row = rows.get(d)!;
    const i = row.indexOf(n.id);
    return { ...n, position: { x: (i - (row.length - 1) / 2) * X_GAP, y: d * Y_GAP } };
  });
}

function isAncestor(candidate: string, of: string, edges: GraphEdge[]): boolean {
  // true if `candidate` can reach `of` (i.e. the edge of→candidate is a back-edge)
  const seen = new Set<string>();
  const stack = [candidate];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === of) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of edges) if (e.source === id) stack.push(e.target);
  }
  return false;
}

/** Starter graph for "create from scratch": Trigger → Message → End. */
export function defaultGraph(): AutomationGraph {
  const g = new GraphBuilder();
  const t = g.trigger({ kind: "keyword", keywords: ["привет"], sampleInput: "привет" }, { label: "Когда пишут «привет»" });
  const m = g.message("Привет, {{contact.first_name}}! 👋 Спасибо, что написали. Чем можем помочь?");
  const e = g.end("completed");
  g.chain(t, m, e);
  return g.build();
}
