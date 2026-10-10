"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, BookOpen, CheckCheck, ExternalLink, Hand, Lock, RotateCcw, SendHorizontal, UserRound, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RelativeTime } from "@/components/common/relative-time";
import { LeadStatusBadge } from "@/components/contacts/lead-status";
import { inboxAction } from "@/app/actions/crm";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  kind: string;
  source: string;
  body: string;
  deliveryStatus: string | null;
  createdAt: string;
  authorName: string | null;
  agentName: string | null;
  payload: { quickReplies?: { id: string; label: string }[]; linkButtons?: { id: string; label: string; url: string }[]; usedSources?: { id: string; title: string }[]; answered?: boolean };
};

type Mode = "reply" | "note" | "simulate";

export function ConversationView({
  slug,
  backHref,
  agents,
  conversation,
  contact,
  messages,
}: {
  slug: string;
  backHref: string;
  agents: { id: string; name: string }[];
  conversation: { id: string; status: string; channel: string; assignedToMe: boolean; assigneeName: string | null };
  contact: { id: string; name: string; email: string | null; phone: string | null; leadStatus: string } | null;
  messages: Msg[];
}) {
  const [mode, setMode] = useState<Mode>("simulate");
  const [text, setText] = useState("");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  const run = (input: Record<string, unknown>, onOk?: (info?: string) => void) =>
    start(async () => {
      const res = await inboxAction(slug, conversation.id, input);
      if (!res.ok) return void toast.error(res.fieldErrors ? Object.values(res.fieldErrors).flat()[0] ?? res.error : res.error);
      if (res.data.info) toast.info(res.data.info);
      onOk?.(res.data.info);
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    const op = mode === "reply" ? { op: "reply", text: body } : mode === "note" ? { op: "note", text: body } : { op: "simulate", text: body, eventId: crypto.randomUUID() };
    run(op, () => setText(""));
  };

  const preview = messages.find((m) => m.kind === "generated_reply");

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <Button asChild variant="ghost" size="icon-sm" className="md:hidden">
          <Link href={backHref} aria-label="Back to list">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-medium">
            {contact?.name ?? "Unknown contact"}
            {contact && <LeadStatusBadge status={contact.leadStatus} />}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[contact?.email, contact?.phone].filter(Boolean).join(" · ") || "No contact details"} · {conversation.channel === "mock" ? "Demo channel" : conversation.channel}
            {conversation.assigneeName && ` · assigned to ${conversation.assignedToMe ? "you" : conversation.assigneeName}`}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {contact && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/w/${slug}/contacts/${contact.id}`}>
                <UserRound aria-hidden /> Contact
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run({ op: "assign", toMe: !conversation.assignedToMe })}>
            <Hand aria-hidden /> {conversation.assignedToMe ? "Unassign" : "Assign to me"}
          </Button>
          {conversation.status === "resolved" ? (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => run({ op: "status", status: "open" })}>
              <RotateCcw aria-hidden /> Reopen
            </Button>
          ) : (
            <Button size="sm" disabled={pending} onClick={() => run({ op: "status", status: "resolved" })}>
              <CheckCheck aria-hidden /> Resolve
            </Button>
          )}
        </div>
      </header>

      {conversation.status === "needs_human" && (
        <p className="flex items-center gap-2 border-b bg-destructive/5 px-4 py-2 text-xs text-destructive">
          <Hand className="size-4" aria-hidden /> Handed off — a human should reply. Automations keep running if the customer writes again.
        </p>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4" aria-live="polite">
        {messages.filter((m) => m.kind !== "generated_reply").map((m) => (
          <MessageItem key={m.id} m={m} />
        ))}
        <div ref={end} />
      </div>

      {preview && <PreviewEditor key={preview.id} preview={preview} pending={pending} run={run} />}

      <form onSubmit={submit} className="space-y-2 border-t bg-card p-3">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Composer mode">
          {(
            [
              ["simulate", "Customer message (simulate)"],
              ["reply", "Reply as you"],
              ["note", "Internal note"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn("rounded-md px-2 py-1 text-xs font-medium", mode === m ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              {label}
            </button>
          ))}
          {agents.length > 0 && (
            <div className="ml-auto flex items-center gap-1.5">
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger className="h-7 w-40 text-xs" aria-label="Agent for AI preview">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" disabled={pending || !agentId || Boolean(preview)} onClick={() => run({ op: "preview", agentId })}>
                <Wand2 aria-hidden /> AI suggestion
              </Button>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={mode === "simulate" ? "Type what the customer sends…" : mode === "reply" ? "Write a reply (delivered via the demo channel)…" : "Visible to your team only…"}
            aria-label="Message"
            className={cn("min-h-0 resize-none", mode === "note" && "bg-warning/10")}
          />
          <Button type="submit" disabled={pending || !text.trim()} aria-label="Send" className="self-end">
            <SendHorizontal aria-hidden />
          </Button>
        </div>
      </form>
    </div>
  );
}

function MessageItem({ m }: { m: Msg }) {
  if (m.kind === "system") {
    return (
      <p className="text-center text-[11px] text-muted-foreground">
        {m.body} · <RelativeTime date={m.createdAt} />
      </p>
    );
  }
  if (m.kind === "internal_note") {
    return (
      <div className="mx-auto max-w-[85%] rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
        <p className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-800">
          <Lock className="size-3" aria-hidden /> Internal note · {m.authorName ?? "Team"} · <RelativeTime date={m.createdAt} />
        </p>
        <p className="whitespace-pre-wrap">{m.body}</p>
      </div>
    );
  }
  const inbound = m.kind === "inbound";
  const who = inbound ? "Customer" : m.source === "agent" ? `AI · ${m.agentName ?? "agent"}` : m.source === "automation" ? "Automation" : m.authorName ?? "You";
  return (
    <div className={cn("flex flex-col gap-1", inbound ? "items-start" : "items-end")}>
      <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap", inbound ? "rounded-bl-sm border bg-card" : "rounded-br-sm bg-primary text-primary-foreground")}>
        {m.body}
        {(m.payload.quickReplies?.length || m.payload.linkButtons?.length) ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {m.payload.quickReplies?.map((q) => (
              <span key={q.id} className="rounded-full border border-primary-foreground/40 px-2 py-0.5 text-xs">
                {q.label}
              </span>
            ))}
            {m.payload.linkButtons?.map((b) => (
              <a key={b.id} href={b.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md bg-primary-foreground/15 px-2 py-0.5 text-xs underline-offset-2 hover:underline">
                {b.label} <ExternalLink className="size-3" aria-hidden />
              </a>
            ))}
          </div>
        ) : null}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {who} · <RelativeTime date={m.createdAt} />
        {!inbound && m.deliveryStatus && ` · ${m.deliveryStatus}`}
      </p>
    </div>
  );
}

function PreviewEditor({ preview, pending, run }: { preview: Msg; pending: boolean; run: (input: Record<string, unknown>, onOk?: () => void) => void }) {
  const [text, setText] = useState(preview.body);
  return (
    <div className="space-y-2 border-t bg-accent/40 p-3">
      <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-accent-foreground">
        <Wand2 className="size-3.5" aria-hidden /> AI suggestion from {preview.agentName ?? "agent"} — not sent yet
        {preview.payload.answered === false && <span className="rounded bg-warning/20 px-1.5 text-amber-800">fallback</span>}
        {preview.payload.usedSources?.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1 rounded bg-card px-1.5 font-normal">
            <BookOpen className="size-3" aria-hidden /> {s.title}
          </span>
        ))}
      </p>
      <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} aria-label="Edit AI suggestion" className="bg-card" />
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || !text.trim()} onClick={() => run({ op: "sendPreview", previewId: preview.id, text })}>
          <SendHorizontal aria-hidden /> Send
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run({ op: "discardPreview", previewId: preview.id })}>
          <X aria-hidden /> Discard
        </Button>
      </div>
    </div>
  );
}
