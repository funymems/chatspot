import type { AutomationGraph, GraphEdge, GraphNode, NodeType } from "@/lib/domain/graph/schema";
import { defaultNodeData } from "@/lib/domain/graph/defaults";

/**
 * Builder state: the working graph plus undo/redo history. Pure reducer so it
 * is easy to test and reason about; React Flow is only a view over it.
 */
export type BuilderState = {
  graph: AutomationGraph;
  selectedId: string | null;
  past: AutomationGraph[];
  future: AutomationGraph[];
  /** Graph before an in-progress drag; committed to history when the drag ends. */
  dragBase: AutomationGraph | null;
  /** Coalesce rapid edits to the same field (typing) into one history entry. */
  lastKey: string | null;
  lastAt: number;
  /** Graph as last saved to the server. */
  saved: AutomationGraph;
};

export type BuilderAction =
  | { type: "commit"; graph: AutomationGraph; select?: string | null; key?: string; at?: number }
  | { type: "drag"; graph: AutomationGraph }
  | { type: "dragEnd" }
  | { type: "select"; id: string | null }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "saved"; graph: AutomationGraph };

const HISTORY_LIMIT = 100;
const COALESCE_MS = 1200;

export function initBuilder(graph: AutomationGraph): BuilderState {
  return { graph, selectedId: null, past: [], future: [], dragBase: null, lastKey: null, lastAt: 0, saved: graph };
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "commit": {
      const at = action.at ?? 0;
      const coalesce = action.key !== undefined && action.key === state.lastKey && at - state.lastAt < COALESCE_MS;
      return {
        ...state,
        graph: action.graph,
        selectedId: action.select !== undefined ? action.select : state.selectedId,
        past: coalesce ? state.past : [...state.past, state.graph].slice(-HISTORY_LIMIT),
        future: [],
        lastKey: action.key ?? null,
        lastAt: at,
      };
    }
    case "drag":
      return { ...state, graph: action.graph, dragBase: state.dragBase ?? state.graph };
    case "dragEnd":
      if (!state.dragBase) return state;
      return {
        ...state,
        past: [...state.past, state.dragBase].slice(-HISTORY_LIMIT),
        future: [],
        dragBase: null,
        lastKey: null,
      };
    case "select":
      return state.selectedId === action.id ? state : { ...state, selectedId: action.id };
    case "undo": {
      const prev = state.past.at(-1);
      if (!prev) return state;
      return {
        ...state,
        graph: prev,
        past: state.past.slice(0, -1),
        future: [state.graph, ...state.future],
        selectedId: prev.nodes.some((n) => n.id === state.selectedId) ? state.selectedId : null,
        lastKey: null,
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        graph: next,
        past: [...state.past, state.graph],
        future: state.future.slice(1),
        selectedId: next.nodes.some((n) => n.id === state.selectedId) ? state.selectedId : null,
        lastKey: null,
      };
    }
    case "saved":
      return { ...state, saved: action.graph };
  }
}

// ─── Graph operations (pure) ────────────────────────────────────────────────

export const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

export function addNode(graph: AutomationGraph, type: NodeType, position: { x: number; y: number }): { graph: AutomationGraph; id: string } {
  const id = newId(type);
  const node: GraphNode = { id, type, position, data: defaultNodeData(type) };
  return { graph: { ...graph, nodes: [...graph.nodes, node] }, id };
}

export function updateNode(graph: AutomationGraph, id: string, patch: Partial<Pick<GraphNode, "data" | "label" | "position">>): AutomationGraph {
  return { ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

export function removeNodes(graph: AutomationGraph, ids: ReadonlySet<string>): AutomationGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => !ids.has(n.id)),
    edges: graph.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
  };
}

export function removeEdges(graph: AutomationGraph, ids: ReadonlySet<string>): AutomationGraph {
  return { ...graph, edges: graph.edges.filter((e) => !ids.has(e.id)) };
}

export function duplicateNode(graph: AutomationGraph, id: string): { graph: AutomationGraph; id: string } | null {
  const source = graph.nodes.find((n) => n.id === id);
  if (!source || source.type === "trigger") return null; // only one trigger allowed
  const copyId = newId(source.type);
  const copy: GraphNode = {
    ...structuredClone(source),
    id: copyId,
    position: { x: source.position.x + 40, y: source.position.y + 60 },
    label: source.label ? `${source.label} (копия)` : undefined,
  };
  return { graph: { ...graph, nodes: [...graph.nodes, copy] }, id: copyId };
}

/**
 * Connects source[handle] → target. A source handle has at most one outgoing
 * edge, so an existing connection from that handle is replaced.
 */
export function connect(graph: AutomationGraph, source: string, sourceHandle: GraphEdge["sourceHandle"], target: string): AutomationGraph {
  const edges = graph.edges.filter((e) => !(e.source === source && e.sourceHandle === sourceHandle));
  edges.push({ id: newId("e"), source, target, sourceHandle });
  return { ...graph, edges };
}

/** Whether a connection is allowed at all (the validator reports the rest). */
export function canConnect(graph: AutomationGraph, source: string, target: string): boolean {
  if (source === target) return false;
  const s = graph.nodes.find((n) => n.id === source);
  const t = graph.nodes.find((n) => n.id === target);
  if (!s || !t) return false;
  if (s.type === "note" || s.type === "end") return false;
  if (t.type === "note" || t.type === "trigger") return false;
  return true;
}
