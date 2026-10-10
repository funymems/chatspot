import { describe, expect, it } from "vitest";
import { defaultGraph } from "@/lib/domain/graph/builder";
import { validateGraph } from "@/lib/domain/graph/validate";
import { addNode, builderReducer, canConnect, connect, duplicateNode, initBuilder, removeNodes, updateNode } from "./state";

describe("builder reducer", () => {
  it("supports undo and redo of commits", () => {
    const g0 = defaultGraph();
    let s = initBuilder(g0);
    const { graph: g1, id } = addNode(g0, "message", { x: 0, y: 0 });
    s = builderReducer(s, { type: "commit", graph: g1, select: id });
    expect(s.graph.nodes).toHaveLength(4);
    expect(s.selectedId).toBe(id);
    s = builderReducer(s, { type: "undo" });
    expect(s.graph).toBe(g0);
    expect(s.selectedId).toBeNull(); // selected node no longer exists
    s = builderReducer(s, { type: "redo" });
    expect(s.graph).toBe(g1);
  });

  it("coalesces rapid edits to the same field into one history entry", () => {
    const g0 = defaultGraph();
    const msg = g0.nodes.find((n) => n.type === "message")!;
    let s = initBuilder(g0);
    for (const [i, text] of ["H", "He", "Hey"].entries()) {
      const g = updateNode(s.graph, msg.id, { data: { ...msg.data, messages: [{ id: "m1", text }] } });
      s = builderReducer(s, { type: "commit", graph: g, key: `${msg.id}:text`, at: 1000 + i * 100 });
    }
    expect(s.past).toHaveLength(1);
    s = builderReducer(s, { type: "undo" });
    expect(s.graph).toBe(g0);
  });

  it("records a drag as a single undoable step", () => {
    const g0 = defaultGraph();
    const id = g0.nodes[0]!.id;
    let s = initBuilder(g0);
    for (const x of [10, 20, 30]) s = builderReducer(s, { type: "drag", graph: updateNode(s.graph, id, { position: { x, y: 0 } }) });
    s = builderReducer(s, { type: "dragEnd" });
    expect(s.past).toEqual([g0]);
  });
});

describe("graph operations", () => {
  it("replaces an existing connection from the same handle", () => {
    const g = defaultGraph();
    const [t, m, e] = g.nodes;
    const next = connect(g, t!.id, "out", e!.id);
    const fromTrigger = next.edges.filter((x) => x.source === t!.id);
    expect(fromTrigger).toHaveLength(1);
    expect(fromTrigger[0]!.target).toBe(e!.id);
    void m;
  });

  it("removes edges attached to deleted nodes", () => {
    const g = defaultGraph();
    const m = g.nodes.find((n) => n.type === "message")!;
    const next = removeNodes(g, new Set([m.id]));
    expect(next.edges.some((e) => e.source === m.id || e.target === m.id)).toBe(false);
    expect(validateGraph(next).valid).toBe(false);
  });

  it("duplicates nodes but never the trigger", () => {
    const g = defaultGraph();
    expect(duplicateNode(g, g.nodes.find((n) => n.type === "trigger")!.id)).toBeNull();
    const m = g.nodes.find((n) => n.type === "message")!;
    const dup = duplicateNode(g, m.id)!;
    expect(dup.graph.nodes).toHaveLength(4);
    expect(dup.graph.nodes.at(-1)!.data).toEqual(m.data);
    expect(dup.graph.nodes.at(-1)!.data).not.toBe(m.data);
  });

  it("blocks impossible connections", () => {
    const g = defaultGraph();
    const t = g.nodes.find((n) => n.type === "trigger")!;
    const e = g.nodes.find((n) => n.type === "end")!;
    expect(canConnect(g, t.id, t.id)).toBe(false);
    expect(canConnect(g, e.id, t.id)).toBe(false);
    expect(canConnect(g, t.id, e.id)).toBe(true);
  });
});
