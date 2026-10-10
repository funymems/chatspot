import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MessagesSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { SearchFilter } from "@/components/common/url-filters";
import { contactName } from "@/components/contacts/lead-status";
import { ConversationView } from "@/components/inbox/conversation-view";
import { NewSimulationButton } from "@/components/inbox/new-simulation-button";
import { requireWorkspace } from "@/lib/server/auth/guards";
import { getConversation, listConversations, statusCounts, type ConversationStatus } from "@/lib/server/services/inbox";
import { listAgentOptions } from "@/lib/server/services/agents";
import { AppError } from "@/lib/server/errors";
import { idSchema } from "@/lib/validation/automation";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Conversations" };

type Props = PageProps<"/w/[slug]/conversations">;

const filters: { value: ConversationStatus | "all"; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "needs_human", label: "Needs human" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

export default function ConversationsPage({ params, searchParams }: Props) {
  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col lg:h-svh">
      <div className="border-b px-4 pt-4 pb-3 sm:px-6">
        <Suspense fallback={<Skeleton className="h-12 w-80" />}>
          <Header params={params} />
        </Suspense>
      </div>
      <Suspense fallback={<Skeleton className="m-4 flex-1 rounded-xl" />}>
        <Inbox params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Header({ params }: { params: Props["params"] }) {
  const { slug } = await params;
  await requireWorkspace(slug);
  return (
    <PageHeader
      title="Conversations"
      description={
        <span className="inline-flex items-center gap-2">
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-amber-800">Demo channel</span>
          Simulated inbox — no external channel (e.g. Instagram) is connected yet.
        </span>
      }
      actions={<NewSimulationButton slug={slug} />}
    />
  );
}

async function Inbox({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspace(slug);
  const status = (filters.find((f) => f.value === sp.status)?.value ?? "open") as ConversationStatus | "all";
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const selectedId = typeof sp.c === "string" && idSchema.safeParse(sp.c).success ? sp.c : null;

  const [list, counts, agents] = await Promise.all([listConversations(ctx, { q, status }), statusCounts(ctx), listAgentOptions(ctx)]);
  let selected = null;
  if (selectedId) {
    try {
      selected = await getConversation(ctx, selectedId);
    } catch (err) {
      if (!(err instanceof AppError && err.code === "not_found")) throw err;
    }
  }

  const href = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status: status === "open" ? undefined : status, q, c: selectedId ?? undefined, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/w/${slug}/conversations${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex min-h-0 flex-1">
      <aside className={cn("flex w-full flex-col border-r md:w-80 lg:w-96", selected && "hidden md:flex")}>
        <div className="space-y-2 border-b p-3">
          <Suspense>
            <SearchFilter placeholder="Search conversations" />
          </Suspense>
          <nav className="flex flex-wrap gap-1" aria-label="Filter by status">
            {filters.map((f) => (
              <Link
                key={f.value}
                href={href({ status: f.value === "open" ? undefined : f.value, c: undefined })}
                aria-current={status === f.value ? "page" : undefined}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium",
                  status === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {f.label}
                {f.value !== "all" && counts[f.value] ? ` (${counts[f.value]})` : ""}
              </Link>
            ))}
          </nav>
        </div>
        <ul className="flex-1 divide-y overflow-y-auto">
          {list.length === 0 && (
            <li className="p-6">
              <EmptyState compact icon={MessagesSquare} title="No conversations" description={q ? "Nothing matches your search." : "Start a simulated conversation to see how automations reply."} />
            </li>
          )}
          {list.map((c) => (
            <li key={c.id}>
              <Link
                href={href({ c: c.id })}
                className={cn("flex gap-3 p-3 transition-colors hover:bg-muted/50", c.id === selectedId && "bg-accent/60")}
                aria-current={c.id === selectedId ? "true" : undefined}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                  {(c.firstName?.[0] ?? "?").toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{contactName({ firstName: c.firstName, lastName: c.lastName })}</span>
                    {c.status === "needs_human" && <span className="size-2 shrink-0 rounded-full bg-destructive" aria-label="Needs human" />}
                    {c.lastMessageAt && <RelativeTime date={c.lastMessageAt} className="ml-auto shrink-0 text-[11px] text-muted-foreground" />}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{c.preview || "No messages"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <section className={cn("min-w-0 flex-1", !selected && "hidden md:flex")} aria-label="Conversation">
        {selected ? (
          <ConversationView
            key={selected.conversation.id}
            slug={slug}
            backHref={href({ c: undefined })}
            agents={agents}
            conversation={{
              id: selected.conversation.id,
              status: selected.conversation.status,
              channel: selected.conversation.channel,
              assignedToMe: selected.conversation.assignedTo === ctx.userId,
              assigneeName: selected.assignee ? selected.assignee.fullName || selected.assignee.email : null,
            }}
            contact={
              selected.contact
                ? {
                    id: selected.contact.id,
                    name: contactName(selected.contact),
                    email: selected.contact.email,
                    phone: selected.contact.phone,
                    leadStatus: selected.contact.leadStatus,
                  }
                : null
            }
            messages={selected.messages.map((m) => ({
              id: m.id,
              kind: m.kind,
              source: m.source,
              body: m.body,
              deliveryStatus: m.deliveryStatus,
              createdAt: m.createdAt.toISOString(),
              authorName: m.authorName,
              agentName: m.agentName,
              payload: m.payload as { quickReplies?: { id: string; label: string }[]; linkButtons?: { id: string; label: string; url: string }[]; usedSources?: { id: string; title: string }[]; answered?: boolean },
            }))}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">Select a conversation</div>
        )}
      </section>
    </div>
  );
}
