import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { NotBuiltYet } from "@/components/shell/not-built-yet";

export const metadata: Metadata = { title: "Contacts" };

export default function Page() {
  return (
    <PageContainer>
      <PageHeader title="Contacts" description="Everyone who has interacted with your workspace." />
      <NotBuiltYet feature="Contacts" stage={7} details="Search, tag, edit and merge contacts with full interaction history." />
    </PageContainer>
  );
}
