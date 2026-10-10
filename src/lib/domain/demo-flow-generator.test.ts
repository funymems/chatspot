import { describe, expect, it } from "vitest";
import { generateDemoFlow } from "./demo-flow-generator";
import { validateGraph } from "./graph/validate";

describe("generateDemoFlow", () => {
  it("builds a valid branching flow for the course example", () => {
    const res = generateDemoFlow(
      "When someone sends the word COURSE, ask whether they want the beginner or advanced course. Then send the relevant link and save their interest as a contact field.",
    );
    const v = validateGraph(res.graph);
    expect(v.issues.filter((i) => i.severity === "error")).toEqual([]);
    const trigger = res.graph.nodes.find((n) => n.type === "trigger")!;
    expect(trigger.data).toMatchObject({ kind: "keyword", keywords: ["COURSE"] });
    expect(res.graph.nodes.filter((n) => n.type === "action").map((n) => (n.data as { action: { value?: string } }).action.value)).toEqual(["beginner", "advanced"]);
  });
  it("handles Russian email capture requests", () => {
    const res = generateDemoFlow("Когда пишут слово ГАЙД, попроси почту и поставь тег");
    expect(validateGraph(res.graph).valid).toBe(true);
    expect(res.graph.nodes.some((n) => n.type === "action" && (n.data as { action: { kind: string } }).action.kind === "capture")).toBe(true);
  });
  it("always produces a valid flow", () => {
    for (const d of ["reply to everyone", "x", "Tag everyone who messages us"]) expect(validateGraph(generateDemoFlow(d).graph).valid).toBe(true);
  });
});
