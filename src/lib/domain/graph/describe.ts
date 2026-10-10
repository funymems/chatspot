import type { GraphNode } from "./schema";

const trunc = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const quoteList = (xs: string[], max = 3) =>
  xs.length === 0 ? "—" : xs.slice(0, max).map((x) => `“${x}”`).join(", ") + (xs.length > max ? ` +${xs.length - max}` : "");

function formatDuration(seconds: number) {
  if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds === 86400 ? "" : "s"}`;
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? "" : "s"}`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}
export { formatDuration };

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
          return ["Manual test run"];
        case "incoming_message":
          return ["Any incoming message"];
        case "keyword":
          return [`Keyword: ${quoteList(d.keywords ?? [])}`];
        case "phrase":
          return [`Phrase ${String(d.phraseMatch ?? "contains").replace("_", " ")}: ${quoteList(d.phrases ?? [], 2)}`];
        case "webhook":
          return [`Event: ${d.eventName || "—"}`];
        default:
          return ["Not configured"];
      }
    case "message": {
      const msgs: { text: string }[] = d?.messages ?? [];
      const lines = [msgs[0]?.text ? trunc(msgs[0].text) : "Empty message"];
      if (msgs.length > 1) lines.push(`+${msgs.length - 1} more message${msgs.length > 2 ? "s" : ""}`);
      const extras: string[] = [];
      if (d?.quickReplies?.length) extras.push(`${d.quickReplies.length} quick repl${d.quickReplies.length === 1 ? "y" : "ies"}`);
      if (d?.linkButtons?.length) extras.push(`${d.linkButtons.length} link${d.linkButtons.length === 1 ? "" : "s"}`);
      if (d?.delaySeconds > 0) extras.push(`delay ${formatDuration(d.delaySeconds)}`);
      if (d?.waitForReply) extras.push(d.saveReplyAs ? `waits for reply → {{${d.saveReplyAs}}}` : "waits for reply");
      if (extras.length) lines.push(extras.join(" · "));
      return lines;
    }
    case "condition": {
      const rules: { kind: string; keywords?: string[]; variable?: string; field?: string; operator?: string; value?: string; tag?: string }[] = d?.rules ?? [];
      if (rules.length === 0) return ["No rules"];
      const join = d?.combinator === "any" ? " OR " : " AND ";
      const text = rules
        .map((r) => {
          const op = (r.operator ?? "").replace(/_/g, " ");
          const val = r.operator === "is_empty" || r.operator === "is_not_empty" ? "" : ` “${r.value ?? ""}”`;
          switch (r.kind) {
            case "message_contains":
              return `message contains ${quoteList(r.keywords ?? [], 2)}`;
            case "variable":
              return `{{${r.variable ?? "?"}}} ${op}${val}`;
            case "has_tag":
              return `has tag “${r.tag ?? "?"}”`;
            case "contact_field":
              return `contact.${r.field ?? "?"} ${op}${val}`;
            default:
              return "unknown rule";
          }
        })
        .join(join);
      return [trunc(text, 110)];
    }
    case "action": {
      const a = d?.action ?? {};
      switch (a.kind) {
        case "add_tag":
          return [`Add tag “${a.tag ?? ""}”`];
        case "remove_tag":
          return [`Remove tag “${a.tag ?? ""}”`];
        case "set_field":
          return [`Set ${a.field ?? "?"} = “${trunc(String(a.value ?? ""), 40)}”`];
        case "capture":
          return [`Capture ${a.target ?? "email"} from ${a.source === "variable" ? `{{${a.variable || "?"}}}` : "last message"}`];
        case "wait":
          return [`Wait ${formatDuration(Number(a.seconds) || 0)}`];
        case "redirect":
          return ["Redirect to another automation"];
        case "log_event":
          return [`Log event “${a.eventName ?? ""}”`];
        case "mark_qualified":
          return ["Mark lead as qualified"];
        default:
          return ["Not configured"];
      }
    }
    case "ai_response":
      return [d?.instructions ? trunc(`AI reply · ${d.instructions}`) : "AI agent reply"];
    case "note":
      return [trunc(d?.text || "Empty note", 140)];
    case "end":
      return [d?.label || ({ completed: "Completed", goal_reached: "Goal reached", handoff: "Hand off to human" } as Record<string, string>)[d?.outcome] || "End"];
  }
}
