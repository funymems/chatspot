import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { NotBuiltYet } from "@/components/shell/not-built-yet";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return (
    <PageContainer>
      <PageHeader title="Analytics" description="Performance derived from real executions." />
      <NotBuiltYet feature="Analytics" stage={7} details="Run counts, success rates, leads captured and node-level failure details." />
    </PageContainer>
  );
}
