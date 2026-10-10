import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import { RetryableError } from "@/lib/server/engine/types";
import { logger } from "@/lib/server/logger";

/**
 * Server-only LLM abstraction. Keys never leave the server; callers get
 * plain text (or JSON text when a schema is given).
 */
export type ChatTurn = { role: "user" | "assistant"; text: string };

export type GenerateRequest = {
  system: string;
  messages: ChatTurn[];
  /** JSON Schema the response must follow (provider-enforced structured output). */
  jsonSchema?: unknown;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
};

export type GenerateResult = { text: string; inputTokens?: number; outputTokens?: number };

export interface LLMProvider {
  readonly id: string;
  readonly model: string;
  generate(req: GenerateRequest): Promise<GenerateResult>;
}

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

class GeminiProvider implements LLMProvider {
  readonly id = "gemini";
  private client: GoogleGenAI;
  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const started = performance.now();
    try {
      const res = await this.client.models.generateContent({
        model: this.model,
        contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] })),
        config: {
          systemInstruction: req.system,
          temperature: req.temperature ?? 0.3,
          maxOutputTokens: req.maxOutputTokens ?? 2048,
          ...(req.jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: req.jsonSchema } : {}),
          httpOptions: { timeout: req.timeoutMs ?? 20_000 },
        },
      });
      const text = res.text ?? "";
      logger.info("ai.generate", {
        provider: this.id,
        model: this.model,
        ms: Math.round(performance.now() - started),
        inputTokens: res.usageMetadata?.promptTokenCount,
        outputTokens: res.usageMetadata?.candidatesTokenCount,
      });
      if (!text) throw new Error("Сервис ИИ вернул пустой ответ");
      return { text, inputTokens: res.usageMetadata?.promptTokenCount, outputTokens: res.usageMetadata?.candidatesTokenCount };
    } catch (err) {
      if (err instanceof ApiError) {
        logger.warn("ai.error", { provider: this.id, model: this.model, status: err.status, message: err.message });
        if (err.status === 429 || err.status >= 500) throw new RetryableError(`Сервис ИИ временно недоступен (${err.status})`);
        if (err.status === 401 || err.status === 403) throw new Error("Сервис ИИ отклонил API-ключ. Проверьте GEMINI_API_KEY.");
        throw new Error(`Ошибка сервиса ИИ (${err.status}): ${err.message.slice(0, 200)}`);
      }
      if (err instanceof Error && /timeout|aborted|ECONNRESET|fetch failed/i.test(err.message)) {
        throw new RetryableError("Сервис ИИ не ответил вовремя");
      }
      throw err;
    }
  }
}

export type AiStatus = { mode: "live"; provider: string; model: string } | { mode: "demo"; reason: string };

/** Returns the configured provider, or null when running in demo mode. */
export function getAiProvider(): LLMProvider | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  return new GeminiProvider(key, process.env.AI_MODEL?.trim() || DEFAULT_GEMINI_MODEL);
}

export function aiStatus(): AiStatus {
  const p = getAiProvider();
  return p
    ? { mode: "live", provider: "Google Gemini", model: p.model }
    : { mode: "demo", reason: "GEMINI_API_KEY не задан, поэтому функции ИИ работают во встроенном демо-режиме." };
}
