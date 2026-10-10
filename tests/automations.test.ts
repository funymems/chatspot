import { beforeAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "@/test/db";
import { registerUser } from "@/lib/server/services/accounts";
import { resolveWorkspaceAccess } from "@/lib/server/services/workspaces";
import {
  activateAutomation,
  createAutomation,
  deactivateAutomation,
  deleteAutomation,
  duplicateAutomation,
  getAutomation,
  listAutomations,
  saveAutomationGraph,
  updateAutomationDetails,
} from "@/lib/server/services/automations";
import { createAutomationFromTemplate, listTemplates } from "@/lib/server/services/templates";
import { getDashboard } from "@/lib/server/services/dashboard";
import { GraphBuilder } from "@/lib/domain/graph/builder";
import type { WorkspaceContext } from "@/lib/server/auth/context";

let ctx: WorkspaceContext;
let other: WorkspaceContext;

beforeAll(async () => {
  await useTestDatabase();
  const a = await registerUser({ fullName: "Ann", email: "ann@example.test", password: "password-ann" });
  const b = await registerUser({ fullName: "Ben", email: "ben@example.test", password: "password-ben" });
  ctx = (await resolveWorkspaceAccess(a.userId, a.workspace.slug))!;
  other = (await resolveWorkspaceAccess(b.userId, b.workspace.slug))!;
});

function brokenGraph() {
  const g = new GraphBuilder();
  g.trigger({ kind: "manual" });
  return g.build(); // no end, trigger output unconnected
}

describe("automations", () => {
  it("creates from scratch with a valid starter flow as a draft", async () => {
    const a = await createAutomation(ctx, { name: "Welcome" });
    expect(a.status).toBe("draft");
    expect(a.triggerType).toBe("keyword");
    const list = await listAutomations(ctx);
    expect(list.map((x) => x.id)).toContain(a.id);
  });

  it("searches and filters by status", async () => {
    const a = await createAutomation(ctx, { name: "Black Friday promo", description: "discount codes" });
    expect((await listAutomations(ctx, { q: "friday" })).map((x) => x.id)).toEqual([a.id]);
    expect((await listAutomations(ctx, { q: "DISCOUNT" })).map((x) => x.id)).toEqual([a.id]);
    expect(await listAutomations(ctx, { q: "100%_" })).toEqual([]);
    expect((await listAutomations(ctx, { status: "active" })).length).toBe(0);
  });

  it("never activates an invalid flow", async () => {
    const a = await createAutomation(ctx, { name: "Broken", graph: brokenGraph() });
    await expect(activateAutomation(ctx, a.id)).rejects.toMatchObject({ code: "validation" });
    expect((await getAutomation(ctx, a.id)).status).toBe("draft");
  });

  it("activates a valid flow by publishing an immutable version", async () => {
    const a = await createAutomation(ctx, { name: "Publish me" });
    const v1 = await activateAutomation(ctx, a.id);
    const loaded = await getAutomation(ctx, a.id);
    expect(loaded.status).toBe("active");
    expect(loaded.published?.id).toBe(v1.id);
    expect(loaded.hasUnpublishedChanges).toBe(false);

    // Re-activating an unchanged graph reuses the version.
    const again = await activateAutomation(ctx, a.id);
    expect(again.id).toBe(v1.id);

    // Editing the draft marks unpublished changes; publishing creates v2.
    const graph = { ...loaded.graph, nodes: loaded.graph.nodes.map((n) => (n.type === "end" ? { ...n, label: "Done" } : n)) };
    await saveAutomationGraph(ctx, a.id, graph, loaded.revision);
    expect((await getAutomation(ctx, a.id)).hasUnpublishedChanges).toBe(true);
    const v2 = await activateAutomation(ctx, a.id);
    expect(v2.version).toBe(2);

    await deactivateAutomation(ctx, a.id);
    expect((await getAutomation(ctx, a.id)).status).toBe("inactive");
  });

  it("detects concurrent graph edits", async () => {
    const a = await createAutomation(ctx, { name: "Concurrent" });
    const rev = await saveAutomationGraph(ctx, a.id, a.graph, a.revision);
    expect(rev).toBe(a.revision + 1);
    await expect(saveAutomationGraph(ctx, a.id, a.graph, a.revision)).rejects.toMatchObject({ code: "conflict" });
  });

  it("duplicates as a new draft and deletes", async () => {
    const a = await createAutomation(ctx, { name: "Original" });
    await activateAutomation(ctx, a.id);
    const copy = await duplicateAutomation(ctx, a.id);
    expect(copy.name).toBe("Original (copy)");
    expect(copy.status).toBe("draft");
    expect(copy.graph).toEqual((await getAutomation(ctx, a.id)).graph);
    await deleteAutomation(ctx, copy.id);
    await expect(getAutomation(ctx, copy.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("isolates automations between workspaces", async () => {
    const mine = await createAutomation(ctx, { name: "Private" });
    await expect(getAutomation(other, mine.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(updateAutomationDetails(other, mine.id, { name: "hacked", description: "" })).rejects.toMatchObject({ code: "not_found" });
    await expect(deleteAutomation(other, mine.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(activateAutomation(other, mine.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(saveAutomationGraph(other, mine.id, mine.graph, mine.revision)).rejects.toMatchObject({ code: "not_found" });
    expect((await listAutomations(other)).some((x) => x.id === mine.id)).toBe(false);
    expect((await getAutomation(ctx, mine.id)).name).toBe("Private");
  });
});

describe("templates", () => {
  it("seeds at least six built-in templates that create activatable automations", async () => {
    const list = await listTemplates(ctx);
    expect(list.length).toBeGreaterThanOrEqual(6);
    const course = list.find((t) => t.slug === "course-sales")!;
    const a = await createAutomationFromTemplate(ctx, course.id);
    expect(a.origin).toBe("template");
    await expect(activateAutomation(ctx, a.id)).resolves.toBeTruthy();
  });
});

describe("dashboard", () => {
  it("computes metrics from persisted data only", async () => {
    const d = await getDashboard(other);
    expect(d.contacts.total).toBe(0);
    expect(d.automations).toEqual({ total: 0, active: 0 });
    expect(d.executions.total).toBe(0);
    const mine = await getDashboard(ctx);
    expect(mine.automations.active).toBeGreaterThan(0);
    expect(mine.activity.length).toBeGreaterThan(0);
  });
});
