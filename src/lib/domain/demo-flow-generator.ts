import { GraphBuilder } from "./graph/builder";
import type { AutomationGraph } from "./graph/schema";

/**
 * Deterministic, rule-based flow generator used when no AI provider is
 * configured. It understands a few common patterns (EN/RU): a trigger
 * keyword, a choice between options, saving the choice to a field, email
 * capture and tagging. Output is clearly labelled as demo in the UI.
 */
export function generateDemoFlow(description: string): { name: string; description: string; graph: AutomationGraph } {
  const text = description.trim();
  const lower = text.toLowerCase();
  const ru = /[а-яё]/i.test(text);
  const g = new GraphBuilder();

  // Trigger keyword: quoted word, an ALL-CAPS word, or "word/keyword X" / "слово X".
  const quoted = text.match(/["“«']([^"”»']{2,40})["”»']/)?.[1];
  const caps = text.match(/\b([A-ZА-ЯЁ]{3,20})\b/u)?.[1];
  const after = text.match(/(?:word|keyword|слово|кодовое слово)\s+([\p{L}\p{N}_-]{2,30})/iu)?.[1];
  const keyword = (quoted ?? caps ?? after)?.trim();
  const trigger = keyword
    ? g.trigger({ kind: "keyword", keywords: [keyword], sampleInput: keyword }, { label: `Keyword: ${keyword.toUpperCase()}` })
    : g.trigger({ kind: "incoming_message", sampleInput: ru ? "Привет" : "Hi" }, { label: ru ? "Любое сообщение" : "Any incoming message" });

  // Options "X or Y" / "X или Y".
  const opt = text.match(/(?:whether|which|if|ли|какой|какую)?\s*(?:they want\s+)?(?:the\s+)?([\p{L}\p{N}-]{3,30})\s+(?:or|или)\s+([\p{L}\p{N}-]{3,30})/iu);
  const options = opt ? [opt[1]!, opt[2]!].map((o) => o.toLowerCase()) : null;
  const wantsField = /\b(field|save|store|remember|interest)\b|сохран|поле|интерес/i.test(lower);
  const wantsEmail = /\be-?mail\b|почт|имейл|email/i.test(lower);
  const wantsTag = /\btag\b|тег|метк/i.test(lower);
  const fieldName = /interest|интерес/i.test(lower) ? "interest" : "choice";

  const t = (en: string, rus: string) => (ru ? rus : en);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const ends: string[] = [];

  if (options) {
    const ask = g.message(t(`Hi {{contact.first_name}}! Which one are you interested in?`, `Привет, {{contact.first_name}}! Что вас интересует?`), {
      quickReplies: options.map((o, i) => ({ id: `q${i + 1}`, label: cap(o) })),
      waitForReply: true,
      saveReplyAs: "choice",
    });
    const cond = g.condition([{ kind: "variable", variable: "choice", operator: "contains", value: options[0]! }], "all", {
      label: `${cap(options[0]!)}?`,
    });
    g.chain(trigger, ask, cond);
    for (const [i, option] of options.entries()) {
      const steps: string[] = [];
      if (wantsField) steps.push(g.action({ kind: "set_field", field: fieldName, value: option }));
      steps.push(
        g.message(t(`Great choice! Here's the ${option} link:`, `Отличный выбор! Вот ссылка на ${option}:`), {
          linkButtons: [{ id: "b1", label: cap(option), url: `https://example.com/${encodeURIComponent(option)}` }],
        }),
      );
      if (wantsTag) steps.push(g.action({ kind: "add_tag", tag: `interested-${option}` }));
      const end = g.end("goal_reached", t("Link sent", "Ссылка отправлена"));
      ends.push(end);
      g.connect(cond, steps[0]!, i === 0 ? "true" : "false").chain(...steps, end);
    }
  } else if (wantsEmail) {
    const ask = g.message(t("Thanks for reaching out! What's the best email to reach you?", "Спасибо, что написали! Подскажите вашу почту?"), {
      waitForReply: true,
      saveReplyAs: "email_reply",
    });
    const capture = g.action({ kind: "capture", target: "email", source: "variable", variable: "email_reply" });
    const steps = [ask, capture];
    if (wantsTag) steps.push(g.action({ kind: "add_tag", tag: "lead" }));
    const thanks = g.message(t("Got it, thank you! We'll be in touch soon.", "Спасибо! Скоро свяжемся с вами."));
    const end = g.end("goal_reached", t("Lead captured", "Лид получен"));
    g.chain(trigger, ...steps, thanks, end);
  } else {
    const reply = g.message(t("Hi {{contact.first_name}}! Thanks for your message — we'll get back to you shortly.", "Привет, {{contact.first_name}}! Спасибо за сообщение — скоро ответим."));
    const steps = [reply];
    if (wantsTag) steps.push(g.action({ kind: "add_tag", tag: "contacted" }));
    g.chain(trigger, ...steps, g.end());
  }

  const name = keyword ? `${cap(keyword.toLowerCase())} ${t("flow", "сценарий")}` : t("Generated flow", "Сгенерированный сценарий");
  return { name, description: text.slice(0, 500), graph: g.build() };
}
