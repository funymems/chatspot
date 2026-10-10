import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { NotBuiltYet } from "@/components/shell/not-built-yet";

export const metadata: Metadata = { title: "AI Agents" };

export default function Page() {
  return (
    <PageContainer>
      <PageHeader title="AI Agents" description="AI assistants grounded in your knowledge base." />
      <NotBuiltYet feature="AI Agents" stage={6} details="Configure agents, manage knowledge sources and test replies in a chat simulator." />
    </PageContainer>
  );
}
