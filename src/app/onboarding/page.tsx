import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { FullPageSpinner } from "@/components/shell/full-page-spinner";
import { requireUser } from "@/lib/server/auth/guards";
import { defaultWorkspaceFor } from "@/lib/server/services/workspaces";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Create a workspace" };

export default function OnboardingPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Onboarding />
    </Suspense>
  );
}

async function Onboarding() {
  const user = await requireUser();
  const existing = await defaultWorkspaceFor(user);
  if (existing) redirect(`/w/${existing.slug}/dashboard`);
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <Logo />
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Create a workspace</h1>
          <p className="text-sm text-muted-foreground">You aren&apos;t a member of any workspace yet.</p>
        </div>
        <OnboardingForm />
      </div>
    </main>
  );
}
