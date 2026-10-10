"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BookOpen, Hand, Loader2, RotateCcw, SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { resetAgentChatAction, sendAgentMessageAction } from "@/app/actions/agents";
import { cn } from "@/lib/utils";
import type { ChatMessageView } from "./types";

/** Playground for an agent: messages are persisted in a private test conversation. */
export function AgentPlayground({
  slug,
  agentId,
  agentName,
  messages,
  status,
}: {
  slug: string;
  agentId: string;
  agentName: string;
  messages: ChatMessageView[];
  status: string;
}) {
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  const [resetting, startReset] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, pendingText]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setError(null);
    setPendingText(text);
    startSend(async () => {
      const res = await sendAgentMessageAction(slug, agentId, { text });
      setPendingText(null);
      if (!res.ok) {
        setError(res.error);
        setDraft(text);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test chat</CardTitle>
        <CardDescription>Talk to {agentName} as a customer would. Nothing is sent to any real channel.</CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            disabled={resetting || messages.length === 0}
            onClick={() =>
              startReset(async () => {
                const res = await resetAgentChatAction(slug, agentId);
                if (res.ok) toast.success(res.message);
                else toast.error(res.error);
              })
            }
          >
            <RotateCcw aria-hidden /> Reset
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === "needs_human" && (
          <p className="flex items-center gap-2 rounded-lg bg-warning/15 px-3 py-2 text-xs text-amber-800">
            <Hand className="size-4" aria-hidden /> This conversation was handed off to a human. Reset to start over.
          </p>
        )}
        <div className="h-[420px] space-y-3 overflow-y-auto rounded-lg border bg-muted/30 p-3" aria-live="polite">
          {messages.length === 0 && !pendingText && (
            <p className="py-16 text-center text-sm text-muted-foreground">Ask a question to see how the agent answers.</p>
          )}
          {messages.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}
          {pendingText && (
            <>
              <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground opacity-70">{pendingText}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> {agentName} is replying…
              </div>
            </>
          )}
          <div ref={bottom} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <form onSubmit={send} className="flex gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a customer message…" aria-label="Message" maxLength={2000} disabled={sending} />
          <Button type="submit" disabled={sending || !draft.trim()} aria-label="Send">
            <SendHorizontal aria-hidden />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Bubble({ m }: { m: ChatMessageView }) {
  const mine = m.kind === "inbound";
  const p = m.payload ?? {};
  return (
    <div className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
          mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border bg-card",
        )}
      >
        {m.body}
      </div>
      {!mine && (
        <div className="flex max-w-[80%] flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5">{p.provider === "demo" ? "demo mode" : p.provider === "rules" ? "escalation rule" : p.provider?.replace("gemini:", "") ?? "agent"}</span>
          {p.answered === false && <span className="rounded bg-warning/15 px-1.5 py-0.5 text-amber-800">fallback</span>}
          {p.handoff && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">handed off</span>}
          {p.usedSources?.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-accent-foreground">
              <BookOpen className="size-3" aria-hidden /> {s.title}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
