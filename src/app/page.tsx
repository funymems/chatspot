import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/server/auth/guards";
import { defaultWorkspaceFor } from "@/lib/server/services/workspaces";
import { FullPageSpinner } from "@/components/shell/full-page-spinner";

export default function Home() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <RedirectToWorkspace />
    </Suspense>
  );
}

async function RedirectToWorkspace(): Promise<never> {
  const user = await getOptionalUser();
  if (!user) redirect("/login");
  const ws = await defaultWorkspaceFor(user);
  redirect(ws ? `/w/${ws.slug}/dashboard` : "/onboarding");
}
