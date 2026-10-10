import "server-only";
import type { automationExecutions } from "@/lib/server/db/schema";
import type { AiResponseConfig } from "@/lib/domain/graph/schema";
import type { EvalScope } from "@/lib/domain/engine/expressions";

export type AiStepResult = {
  reply: string;
  usedSources: { id: string; title: string }[];
  handoff: boolean;
  handoffReason?: string;
  provider: string;
};

type AiStepParams = {
  execution: typeof automationExecutions.$inferSelect;
  config: AiResponseConfig;
  scope: EvalScope;
};

type AiStepImpl = (p: AiStepParams) => Promise<AiStepResult>;
// Stored on globalThis so every server bundle in the process sees the same registration.
const key = Symbol.for("chatspot.aiStep");
const slot = globalThis as unknown as Record<symbol, AiStepImpl | undefined>;

/** The agent runtime registers itself here (keeps the engine independent of AI providers). */
export function registerAiStep(fn: AiStepImpl) {
  slot[key] = fn;
}

export async function runAiStep(p: AiStepParams): Promise<AiStepResult> {
  if (!slot[key]) await import("@/lib/server/agents/engine-bridge"); // registers the agent runtime
  const impl = slot[key];
  if (!impl) throw new Error("Не удалось загрузить модуль ИИ-агента");
  return impl(p);
}
