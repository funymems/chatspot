import type { TriggerConfig } from "./graph/schema";

/** Splits text into word tokens, Unicode-aware (works for Latin, Cyrillic, …). */
export function words(text: string): string[] {
  return text.split(/[^\p{L}\p{N}_]+/u).filter(Boolean);
}

/**
 * Whether an incoming message text starts a flow with this trigger.
 * Shared by the builder's live preview and the execution engine.
 */
export function matchesTrigger(config: Pick<TriggerConfig, "kind" | "keywords" | "phrases" | "phraseMatch" | "caseSensitive">, text: string): boolean {
  const norm = (s: string) => (config.caseSensitive ? s : s.toLowerCase());
  const input = norm(text.trim());
  switch (config.kind) {
    case "incoming_message":
      return input.length > 0;
    case "keyword": {
      const tokens = new Set(words(input));
      return config.keywords.some((k) => {
        const kw = words(norm(k.trim()));
        // multi-word keywords must appear as a contiguous phrase
        return kw.length === 1 ? tokens.has(kw[0]!) : kw.length > 1 && ` ${words(input).join(" ")} `.includes(` ${kw.join(" ")} `);
      });
    }
    case "phrase":
      return config.phrases.some((p) => {
        const ph = norm(p.trim());
        if (!ph) return false;
        if (config.phraseMatch === "exact") return input === ph;
        if (config.phraseMatch === "starts_with") return input.startsWith(ph);
        return input.includes(ph);
      });
    case "manual":
    case "webhook":
      return false; // started explicitly, never by message text
  }
}
