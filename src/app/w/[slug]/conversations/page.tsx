import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { NotBuiltYet } from "@/components/shell/not-built-yet";

export const metadata: Metadata = { title: "Conversations" };

export default function Page() {
  return (
    <PageContainer>
      <PageHeader title="Conversations" description="Simulated inbox for connected channels." />
      <NotBuiltYet feature="Conversations" stage={7} details="An internal inbox with notes, AI reply previews, human handoff and test messages." />
    </PageContainer>
  );
}
