import type { GraphNode } from "./schema";

const trunc = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const quoteList = (xs: string[], max = 3) =>
  xs.length === 0 ? "—" : xs.slice(0, max).map((x) => `«${x}»`).join(", ") + (xs.length > max ? ` +${xs.length - max}` : "");

function formatDuration(seconds: number) {
  if (seconds % 86400 === 0) return `${seconds / 86400} дн.`;
  if (seconds % 3600 === 0) return `${seconds / 3600} ч`;
  if (seconds % 60 === 0) return `${seconds / 60} мин`;
  return `${seconds} с`;
}
export { formatDuration };

const opLabels: Record<string, string> = { equals: "равно", not_equals: "не равно", contains: "содержит", is_empty: "пусто", is_not_empty: "не пусто" };
const phraseLabels: Record<string, string> = { contains: "содержит", exact: "равна", starts_with: "начинается с" };

/**
 * One-to-three human-readable lines summarising a node's configuration.
 * Tolerates incomplete drafts (missing fields) without throwing.
 */
export function describeNode(node: GraphNode): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = node.data as any;
  switch (node.type) {
    case "trigger":
      switch (d?.kind) {
        case "manual":
          return ["Запуск вручную (тест)"];
        case "incoming_message":
          return ["Любое входящее сообщение"];
        case "keyword":
          return [`Ключевое слово: ${quoteList(d.keywords ?? [])}`];
        case "phrase":
          return [`Фраза (${phraseLabels[d.phraseMatch ?? "contains"] ?? d.phraseMatch}): ${quoteList(d.phrases ?? [], 2)}`];
        case "webhook":
          return [`Событие: ${d.eventName || "—"}`];
        default:
          return ["Не настроено"];
      }
    case "message": {
      const msgs: { text: string }[] = d?.messages ?? [];
      const lines = [msgs[0]?.text ? trunc(msgs[0].text) : "Пустое сообщение"];
      if (msgs.length > 1) lines.push(`ещё сообщений: ${msgs.length - 1}`);
      const extras: string[] = [];
      if (d?.quickReplies?.length) extras.push(`быстрых ответов: ${d.quickReplies.length}`);
      if (d?.linkButtons?.length) extras.push(`ссылок: ${d.linkButtons.length}`);
      if (d?.delaySeconds > 0) extras.push(`задержка ${formatDuration(d.delaySeconds)}`);
      if (d?.waitForReply) extras.push(d.saveReplyAs ? `ждёт ответа → {{${d.saveReplyAs}}}` : "ждёт ответа");
      if (extras.length) lines.push(extras.join(" · "));
      return lines;
    }
    case "condition": {
      const rules: { kind: string; keywords?: string[]; variable?: string; field?: string; operator?: string; value?: string; tag?: string }[] = d?.rules ?? [];
      if (rules.length === 0) return ["Нет правил"];
      const join = d?.combinator === "any" ? " ИЛИ " : " И ";
      const text = rules
        .map((r) => {
          const op = opLabels[r.operator ?? ""] ?? r.operator ?? "";
          const val = r.operator === "is_empty" || r.operator === "is_not_empty" ? "" : ` «${r.value ?? ""}»`;
          switch (r.kind) {
            case "message_contains":
              return `в сообщении есть ${quoteList(r.keywords ?? [], 2)}`;
            case "variable":
              return `{{${r.variable ?? "?"}}} ${op}${val}`;
            case "has_tag":
              return `есть тег «${r.tag ?? "?"}»`;
            case "contact_field":
              return `contact.${r.field ?? "?"} ${op}${val}`;
            default:
              return "неизвестное правило";
          }
        })
        .join(join);
      return [trunc(text, 110)];
    }
    case "action": {
      const a = d?.action ?? {};
      switch (a.kind) {
        case "add_tag":
          return [`Добавить тег «${a.tag ?? ""}»`];
        case "remove_tag":
          return [`Убрать тег «${a.tag ?? ""}»`];
        case "set_field":
          return [`Записать ${a.field ?? "?"} = «${trunc(String(a.value ?? ""), 40)}»`];
        case "capture":
          return [`Сохранить ${a.target === "phone" ? "телефон" : "эл. почту"} из ${a.source === "variable" ? `{{${a.variable || "?"}}}` : "последнего сообщения"}`];
        case "wait":
          return [`Подождать ${formatDuration(Number(a.seconds) || 0)}`];
        case "redirect":
          return ["Перейти в другую автоматизацию"];
        case "log_event":
          return [`Записать событие «${a.eventName ?? ""}»`];
        case "mark_qualified":
          return ["Отметить лид как квалифицированный"];
        default:
          return ["Не настроено"];
      }
    }
    case "ai_response":
      return [d?.instructions ? trunc(`Ответ ИИ · ${d.instructions}`) : "Ответ ИИ-агента"];
    case "note":
      return [trunc(d?.text || "Пустая заметка", 140)];
    case "end":
      return [d?.label || ({ completed: "Завершено", goal_reached: "Цель достигнута", handoff: "Передача человеку" } as Record<string, string>)[d?.outcome] || "Конец"];
  }
}
