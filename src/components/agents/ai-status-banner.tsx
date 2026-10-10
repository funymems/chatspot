import { Cpu, FlaskConical } from "lucide-react";
import type { AiStatus } from "@/lib/server/ai/provider";

/** Tells the user honestly which engine answers: Gemini or the built-in demo mode. */
export function AiStatusBanner({ status }: { status: AiStatus }) {
  if (status.mode === "live") {
    return (
      <p className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground">
        <Cpu className="size-4 text-primary" aria-hidden />
        Ответы генерирует <span className="font-medium text-foreground">{status.provider}</span> ({status.model}) — только на основе базы знаний
        каждого агента.
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-amber-800">
      <FlaskConical className="mt-px size-4 shrink-0" aria-hidden />
      <span>
        <span className="font-medium">Демо-режим.</span> Сервис ИИ не настроен, поэтому агенты отвечают наиболее подходящей записью из базы знаний
        (без языковой модели). Добавьте <code className="rounded bg-amber-100 px-1">GEMINI_API_KEY</code> в <code className="rounded bg-amber-100 px-1">.env.local</code> и перезапустите сервер, чтобы использовать Gemini.
      </span>
    </p>
  );
}
