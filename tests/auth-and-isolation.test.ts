import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { useTestDatabase } from "@/test/db";
import { hashPassword, verifyPassword } from "@/lib/server/auth/password";
import { authenticate, registerUser } from "@/lib/server/services/accounts";
import {
  assertRole,
  createWorkspace,
  listWorkspacesForUser,
  resolveWorkspaceAccess,
} from "@/lib/server/services/workspaces";
import { listRecentActivity } from "@/lib/server/services/activity";
import { AppError } from "@/lib/server/errors";
import type { Database } from "@/lib/server/db/client";

let db: Database;
beforeAll(async () => {
  db = await useTestDatabase();
});

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse");
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("accounts", () => {
  it("registers a user with an owned personal workspace", async () => {
    const { userId, workspace } = await registerUser({ fullName: "Ada Lovelace", email: "ada@example.test", password: "password-1" });
    expect(workspace.role).toBe("owner");
    const list = await listWorkspacesForUser(userId);
    expect(list.map((w) => w.id)).toEqual([workspace.id]);
  });

  it("rejects duplicate emails case-insensitively", async () => {
    await expect(
      registerUser({ fullName: "Ada 2", email: "ADA@example.test", password: "password-2" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("authenticates only with the correct password", async () => {
    expect(await authenticate({ email: "ada@example.test", password: "password-1" })).toBeTruthy();
    expect(await authenticate({ email: "ada@example.test", password: "nope" })).toBeNull();
    expect(await authenticate({ email: "nobody@example.test", password: "password-1" })).toBeNull();
  });
});

describe("workspace isolation", () => {
  it("never grants access to a workspace the user is not a member of", async () => {
    const a = await registerUser({ fullName: "Alice", email: "alice@example.test", password: "password-a" });
    const b = await registerUser({ fullName: "Bob", email: "bob@example.test", password: "password-b" });

    expect(await resolveWorkspaceAccess(a.userId, a.workspace.slug)).toMatchObject({ workspaceId: a.workspace.id });
    expect(await resolveWorkspaceAccess(a.userId, b.workspace.slug)).toBeNull();
    expect(await resolveWorkspaceAccess(b.userId, a.workspace.slug)).toBeNull();
    expect(await resolveWorkspaceAccess(a.userId, "does-not-exist")).toBeNull();

    const aList = await listWorkspacesForUser(a.userId);
    expect(aList.some((w) => w.id === b.workspace.id)).toBe(false);
  });

  it("scopes activity to the workspace", async () => {
    const a = await registerUser({ fullName: "Carol", email: "carol@example.test", password: "password-c" });
    const second = await createWorkspace(a.userId, "Second brand");
    const ctx = (await resolveWorkspaceAccess(a.userId, second.slug))!;
    const events = await listRecentActivity(ctx);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.workspaceId === second.id)).toBe(true);
  });

  it("enforces role requirements", async () => {
    const ctx = {
      workspaceId: "00000000-0000-0000-0000-000000000000",
      workspaceSlug: "x",
      workspaceName: "X",
      userId: "u",
      role: "member" as const,
    };
    expect(() => assertRole(ctx, "admin")).toThrow(AppError);
    expect(() => assertRole({ ...ctx, role: "owner" }, "admin")).not.toThrow();
  });
});

describe("schema", () => {
  it("indexes knowledge entries for full-text search (generated tsvector)", async () => {
    const { userId, workspace } = await registerUser({ fullName: "Kim", email: "kim@example.test", password: "password-k" });
    void userId;
    const [agent] = (
      await db.execute(
        sql`insert into ai_agents (workspace_id, name) values (${workspace.id}, 'Helper') returning id`,
      )
    ).rows as { id: string }[];
    const [source] = (
      await db.execute(
        sql`insert into knowledge_sources (workspace_id, agent_id, type, title) values (${workspace.id}, ${agent!.id}, 'text', 'Hours') returning id`,
      )
    ).rows as { id: string }[];
    await db.execute(
      sql`insert into knowledge_entries (workspace_id, agent_id, source_id, chunk_index, content)
          values (${workspace.id}, ${agent!.id}, ${source!.id}, 0, 'We are open Monday to Friday. Доставка по всей стране.')`,
    );
    const hit = await db.execute(
      sql`select count(*)::int as n from knowledge_entries where search @@ websearch_to_tsquery('simple', 'monday')`,
    );
    const hitRu = await db.execute(
      sql`select count(*)::int as n from knowledge_entries where search @@ websearch_to_tsquery('simple', 'доставка')`,
    );
    expect((hit.rows[0] as { n: number }).n).toBe(1);
    expect((hitRu.rows[0] as { n: number }).n).toBe(1);
  });
});
