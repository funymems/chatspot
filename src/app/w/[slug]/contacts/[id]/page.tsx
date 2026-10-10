import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { RelativeTime } from "@/components/common/relative-time";
import { RunStatusBadge } from "@/components/automations/run-status";
import { LeadStatusBadge, contactName } from "@/components/contacts/lead-status";
import { ContactEditor, CustomFieldsEditor, DuplicatesCard, TagsEditor } from "@/components/contacts/contact-editor";
import { requireWorkspace } from "@/lib/server/auth/guards";
import { AppError } from "@/lib/server/errors";
import { getContactDetail } from "@/lib/server/services/contacts";
import { idSchema } from "@/lib/validation/automation";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Contact" };

type Props = PageProps<"/w/[slug]/contacts/[id]">;

export default function ContactPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 rounded-xl" />
        </PageContainer>
      }
    >
      <ContactDetail params={params} />
    </Suspense>
  );
}

const kindLabel: Record<string, string> = {
  inbound: "Customer",
  outbound: "Sent",
  internal_note: "Note",
  system: "System",
  generated_reply: "AI preview",
};

async function ContactDetail({ params }: { params: Props["params"] }) {
  const { slug, id } = await params;
  const ctx = await requireWorkspace(slug);
  if (!idSchema.safeParse(id).success) notFound();
  let d;
  try {
    d = await getContactDetail(ctx, id);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
  const c = d.contact;
  if (c.mergedIntoId) {
    return (
      <PageContainer>
        <PageHeader breadcrumbs={[{ label: "Contacts", href: `/w/${slug}/contacts` }, { label: contactName(c) }]} title={contactName(c)} />
        <p className="rounded-lg border bg-card p-4 text-sm">
          This contact was merged into{" "}
          <Link className="font-medium text-primary hover:underline" href={`/w/${slug}/contacts/${c.mergedIntoId}`}>
            another contact
          </Link>
          .
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-6xl">
      <PageHeader
        breadcrumbs={[{ label: "Contacts", href: `/w/${slug}/contacts` }, { label: contactName(c) }]}
        title={
          <span className="flex items-center gap-3">
            {contactName(c)} <LeadStatusBadge status={c.leadStatus} />
          </span>
        }
        description={
          <>
            Source: {c.source === "mock" ? "simulator" : c.source} · added <RelativeTime date={c.createdAt} />
            {c.lastInteractionAt && (
              <>
                {" "}
                · last interaction <RelativeTime date={c.lastInteractionAt} />
              </>
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <ContactEditor
            slug={slug}
            contact={{ id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email ?? "", phone: c.phone ?? "", leadStatus: c.leadStatus, notes: c.notes }}
          />
          <Card>
            <CardHeader>
              <CardTitle>Interaction history</CardTitle>
              <CardDescription>Latest messages across this contact&apos;s conversations.</CardDescription>
            </CardHeader>
            <CardContent>
              {d.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages yet.</p>
              ) : (
                <ol className="space-y-3">
                  {d.history.map((m) => (
                    <li key={m.id} className="flex gap-3 text-sm">
                      <MessageSquare className={cn("mt-0.5 size-4 shrink-0", m.kind === "inbound" ? "text-primary" : "text-muted-foreground")} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                          {kindLabel[m.kind] ?? m.kind}
                          {m.kind === "outbound" ? ` by ${m.source}` : ""} · <RelativeTime date={m.createdAt} />
                        </p>
                        <p className="line-clamp-3 whitespace-pre-wrap">{m.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {d.conversationIds[0] && (
                <Link href={`/w/${slug}/conversations?c=${d.conversationIds[0]}`} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
                  Open in inbox →
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <TagsEditor slug={slug} contactId={c.id} tags={d.tags} />
          <CustomFieldsEditor slug={slug} contactId={c.id} fields={c.customFields as Record<string, string>} />
          <Card>
            <CardHeader>
              <CardTitle>Automation runs</CardTitle>
            </CardHeader>
            <CardContent>
              {d.runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No automation has run for this contact.</p>
              ) : (
                <ul className="space-y-2">
                  {d.runs.map((r) => (
                    <li key={r.id}>
                      <Link href={`/w/${slug}/automations/${r.automationId}/runs/${r.id}`} className="flex items-center gap-2 rounded-lg p-1.5 text-sm hover:bg-muted/50">
                        <RunStatusBadge status={r.status} />
                        <span className="min-w-0 flex-1 truncate">{r.automationName}</span>
                        <RelativeTime date={r.createdAt} className="text-xs text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <DuplicatesCard
            slug={slug}
            primary={{ id: c.id, name: contactName(c) }}
            duplicates={d.duplicates.map((x) => ({ id: x.id, name: contactName(x), detail: [x.email, x.phone].filter(Boolean).join(" · ") }))}
          />
        </div>
      </div>
    </PageContainer>
  );
}
