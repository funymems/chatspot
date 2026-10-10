"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CircleHelp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { resolveUnansweredAction } from "@/app/actions/agents";
import type { UnansweredView } from "./types";

export function UnansweredTab({ slug, questions }: { slug: string; questions: UnansweredView[] }) {
  const open = questions.filter((q) => !q.resolved);
  const done = questions.filter((q) => q.resolved);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Unanswered questions</CardTitle>
        <CardDescription>Questions the agent couldn&apos;t answer from its knowledge. Answer them once and the agent will know next time.</CardDescription>
      </CardHeader>
      <CardContent>
        {open.length === 0 ? (
          <EmptyState compact icon={CircleHelp} title="Nothing waiting" description="New gaps in the knowledge base show up here." />
        ) : (
          <ul className="space-y-3">
            {open.map((q) => (
              <QuestionRow key={q.id} slug={slug} q={q} />
            ))}
          </ul>
        )}
        {done.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-muted-foreground">{done.length} resolved</summary>
            <ul className="mt-2 space-y-1">
              {done.map((q) => (
                <li key={q.id} className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-success" aria-hidden /> {q.question}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function QuestionRow({ slug, q }: { slug: string; q: UnansweredView }) {
  const [answer, setAnswer] = useState("");
  const [pending, start] = useTransition();
  const resolve = (withAnswer: boolean) =>
    start(async () => {
      const res = await resolveUnansweredAction(slug, q.id, withAnswer ? answer : "");
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  return (
    <li className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">“{q.question}”</p>
      <p className="text-xs text-muted-foreground">
        Asked <RelativeTime date={q.createdAt} />
      </p>
      <Textarea rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Write the answer the agent should give…" aria-label={`Answer for: ${q.question}`} />
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || !answer.trim()} onClick={() => resolve(true)}>
          Add to knowledge base
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => resolve(false)}>
          Dismiss
        </Button>
      </div>
    </li>
  );
}
