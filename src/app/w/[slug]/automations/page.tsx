import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { NotBuiltYet } from "@/components/shell/not-built-yet";

export const metadata: Metadata = { title: "Automations" };

export default function Page() {
  return (
    <PageContainer>
      <PageHeader title="Automations" description="Build and manage conversation flows." />
      <NotBuiltYet feature="Automations" stage={3} details="Create, duplicate, activate and organise automations, then open them in the visual builder." />
    </PageContainer>
  );
}
