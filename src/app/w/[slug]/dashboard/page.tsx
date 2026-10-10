import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { NotBuiltYet } from "@/components/shell/not-built-yet";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <PageContainer>
      <PageHeader title="Dashboard" description="Overview of your workspace activity." />
      <NotBuiltYet feature="Dashboard" stage={3} details="Metrics are calculated from persisted contacts, automations and executions and arrive with automation management." />
    </PageContainer>
  );
}
