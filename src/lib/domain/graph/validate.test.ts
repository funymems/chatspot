import { describe, expect, it } from "vitest";
import { GraphBuilder, defaultGraph } from "./builder";
import { validateGraph } from "./validate";
import { builtInTemplates } from "../templates";

const codes = (input: unknown, ctx = {}) => validateGraph(input, ctx).issues.map((i) => `${i.severity}:${i.code}`);

describe("validateGraph", () => {
  it("accepts the default starter graph", () => {
    const r = validateGraph(defaultGraph());
    expect(r.issues).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it.each(builtInTemplates.map((t) => [t.slug, t] as const))("built-in template %s is valid", (_slug, t) => {
    const r = validateGraph(t.build());
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("rejects malformed structures", () => {
    const r = validateGraph({ nodes: "nope" });
    expect(r.valid).toBe(false);
    expect(r.issues[0]?.code).toBe("invalid_structure");
  });

  it("requires exactly one trigger and an end", () => {
    expect(codes({ nodes: [], edges: [] })).toEqual(expect.arrayContaining(["error:missing_trigger", "error:missing_end"]));
    const g = new GraphBuilder();
    const a = g.trigger({ kind: "manual" });
    const b = g.trigger({ kind: "manual" });
    const e = g.end();
    g.chain(a, e).connect(b, e);
    expect(codes(g.build())).toContain("error:multiple_triggers");
  });

  it("reports unconnected outputs, including both condition branches", () => {
    const g = new GraphBuilder();
    const t = g.trigger({ kind: "manual" });
    const c = g.condition([{ kind: "has_tag", tag: "vip" }]);
    const e = g.end();
    g.chain(t, c).connect(c, e, "true");
    const r = validateGraph(g.build());
    expect(r.valid).toBe(false);
    expect(r.issues.find((i) => i.code === "missing_connection")?.nodeId).toBe(c);
  });

  it("rejects connections to notes, invalid handles and dangling edges", () => {
    const g = new GraphBuilder();
    const t = g.trigger({ kind: "manual" });
    const n = g.note("hello");
    const e = g.end();
    g.chain(t, e).connect(e, n);
    const graph = g.build();
    graph.edges.push({ id: "x", source: t, target: "ghost", sourceHandle: "out" });
    graph.edges.push({ id: "y", source: t, target: e, sourceHandle: "true" });
    expect(codes(graph)).toEqual(expect.arrayContaining(["error:note_connected", "error:dangling_edge", "error:invalid_handle"]));
  });

  it("detects loops without a pause as infinite", () => {
    const g = new GraphBuilder();
    const t = g.trigger({ kind: "manual" });
    const a = g.action({ kind: "add_tag", tag: "x" });
    const c = g.condition([{ kind: "has_tag", tag: "done" }]);
    const e = g.end();
    g.chain(t, a, c).connect(c, e, "true").connect(c, a, "false");
    expect(codes(g.build())).toContain("error:infinite_loop");
  });

  it("allows loops that contain a wait (with a warning)", () => {
    const g = new GraphBuilder();
    const t = g.trigger({ kind: "manual" });
    const w = g.action({ kind: "wait", seconds: 60 });
    const c = g.condition([{ kind: "has_tag", tag: "done" }]);
    const e = g.end();
    g.chain(t, w, c).connect(c, e, "true").connect(c, w, "false");
    const r = validateGraph(g.build());
    expect(r.valid).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain("loop");
  });

  it("warns about unreachable nodes", () => {
    const g = new GraphBuilder();
    const t = g.trigger({ kind: "manual" });
    const e = g.end();
    const orphan = g.message("never sent");
    const e2 = g.end();
    g.chain(t, e).chain(orphan, e2);
    const r = validateGraph(g.build());
    expect(r.valid).toBe(true);
    expect(r.issues.filter((i) => i.code === "unreachable").map((i) => i.nodeId)).toEqual([orphan, e2]);
  });

  it("validates node configuration with field paths", () => {
    const g = new GraphBuilder();
    const t = g.trigger({ kind: "keyword", keywords: [] });
    const m = g.message("   ");
    const e = g.end();
    g.chain(t, m, e);
    const r = validateGraph(g.build());
    expect(r.valid).toBe(false);
    expect(r.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "trigger_keywords", nodeId: t }),
        expect.objectContaining({ code: "empty_message", nodeId: m, path: "messages.0.text" }),
      ]),
    );
  });

  it("checks workspace references when context is provided", () => {
    const g = new GraphBuilder();
    const t = g.trigger({ kind: "manual" });
    const ai = g.aiResponse({ agentId: "00000000-0000-4000-8000-000000000001" });
    const r = g.action({ kind: "redirect", automationId: "00000000-0000-4000-8000-000000000002" });
    const e = g.end();
    g.chain(t, ai, r, e);
    const res = validateGraph(g.build(), { agentIds: new Set(), automationIds: new Set() });
    expect(res.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["agent_missing", "redirect_missing"]));
    const self = validateGraph(g.build(), {
      agentIds: new Set(["00000000-0000-4000-8000-000000000001"]),
      automationIds: new Set(["00000000-0000-4000-8000-000000000002"]),
      selfAutomationId: "00000000-0000-4000-8000-000000000002",
    });
    expect(self.issues.map((i) => i.code)).toContain("redirect_self");
  });
});
