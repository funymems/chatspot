import type { Edge } from "@xyflow/react";
import type { AutomationGraph } from "@/lib/domain/graph/schema";
import type { GraphIssue } from "@/lib/domain/graph/validate";
import type { FlowNode } from "./flow-node";

export function edgeStyle(handle: string) {
  if (handle === "true") return { label: "Yes", style: { stroke: "var(--success)" } };
  if (handle === "false") return { label: "No", style: { stroke: "var(--destructive)" } };
  return {};
}

export function toReactFlow(graph: AutomationGraph, issues: GraphIssue[] = []): { nodes: FlowNode[]; edges: Edge[] } {
  const errorsByNode = new Map<string, number>();
  for (const i of issues) {
    if (i.severity === "error" && i.nodeId) errorsByNode.set(i.nodeId, (errorsByNode.get(i.nodeId) ?? 0) + 1);
  }
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: { node: n, errorCount: errorsByNode.get(n.id) ?? 0, isStart: n.type === "trigger" },
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      ...edgeStyle(e.sourceHandle),
    })),
  };
}
