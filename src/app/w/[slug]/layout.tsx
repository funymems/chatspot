import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ShellSkeleton } from "@/components/shell/shell-skeleton";
import { requireUser, requireWorkspace } from "@/lib/server/auth/guards";
import { listWorkspacesForUser, rememberLastWorkspace } from "@/lib/server/services/workspaces";

export default function WorkspaceLayout({ children, params }: LayoutProps<"/w/[slug]">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AuthorizedShell params={params}>{children}</AuthorizedShell>
    </Suspense>
  );
}

/** Authorises the workspace in the URL before anything below it renders. */
async function AuthorizedShell({
  params,
  children,
}: {
  params: LayoutProps<"/w/[slug]">["params"];
  children: React.ReactNode;
}) {
  const { slug } = await params;
  const user = await requireUser();
  const ctx = await requireWorkspace(slug);
  const [workspaces] = await Promise.all([
    listWorkspacesForUser(user.id),
    user.lastWorkspaceId !== ctx.workspaceId ? rememberLastWorkspace(ctx) : Promise.resolve(),
  ]);
  const current = workspaces.find((w) => w.id === ctx.workspaceId)!;
  return (
    <AppShell workspace={current} workspaces={workspaces} user={{ fullName: user.fullName, email: user.email }}>
      {children}
    </AppShell>
  );
}
