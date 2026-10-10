import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { NotBuiltYet } from "@/components/shell/not-built-yet";

export const metadata: Metadata = { title: "Templates" };

export default function Page() {
  return (
    <PageContainer>
      <PageHeader title="Templates" description="Start from proven automation flows." />
      <NotBuiltYet feature="Templates" stage={7} details="A gallery of real, validated automation graphs you can preview and duplicate." />
    </PageContainer>
  );
}
