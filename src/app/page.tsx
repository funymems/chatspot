import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/server/auth/guards";
import { defaultWorkspaceFor } from "@/lib/server/services/workspaces";
import { FullPageSpinner } from "@/components/shell/full-page-spinner";
import { Landing } from "./landing";

export default function Home() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <HomeForVisitor />
    </Suspense>
  );
}

/** Signed-in users go straight to their workspace; everyone else sees the public landing page. */
async function HomeForVisitor() {
  const user = await getOptionalUser();
  if (!user) return <Landing />;
  const ws = await defaultWorkspaceFor(user);
  redirect(ws ? `/w/${ws.slug}/dashboard` : "/onboarding");
}
