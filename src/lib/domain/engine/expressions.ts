import type { CompareOperator, ConditionConfig, ConditionRule } from "../graph/schema";
import { words } from "../trigger-match";

/**
 * Everything a running flow can read. Plain data only — templates are
 * resolved by path lookup, never evaluated as code.
 */
export type EvalScope = {
  contact: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    lead_status: string;
    notes: string;
    custom: Record<string, string>;
  };
  tags: string[];
  /** Latest inbound message text. */
  message: string;
  /** Flow variables (saved replies, set values). */
  vars: Record<string, string>;
};

const BUILTIN_CONTACT_FIELDS = ["first_name", "last_name", "email", "phone", "lead_status", "notes"] as const;
export type BuiltinContactField = (typeof BUILTIN_CONTACT_FIELDS)[number];
export const isBuiltinContactField = (f: string): f is BuiltinContactField => (BUILTIN_CONTACT_FIELDS as readonly string[]).includes(f);

/** Own-property lookup only, so names like `__proto__` can never reach the prototype chain. */
function own(record: Record<string, string>, key: string): string {
  return Object.hasOwn(record, key) && typeof record[key] === "string" ? record[key] : "";
}

export function contactField(scope: EvalScope, field: string): string {
  if (isBuiltinContactField(field)) return scope.contact[field] ?? "";
  return own(scope.contact.custom, field);
}

/** Resolves a dotted path like `contact.first_name`, `message.text` or `course_choice`. */
export function resolvePath(scope: EvalScope, path: string): string {
  const p = path.trim();
  if (p === "message.text" || p === "message") return scope.message;
  if (p.startsWith("contact.")) return contactField(scope, p.slice("contact.".length));
  if (p.startsWith("vars.")) return own(scope.vars, p.slice(5));
  return own(scope.vars, p);
}

/** Replaces `{{path}}` placeholders. Unknown variables render as empty strings. */
export function renderTemplate(text: string, scope: EvalScope): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, path: string) => resolvePath(scope, path));
}

export function compare(actual: string, operator: CompareOperator, expected: string): boolean {
  const a = actual.trim().toLowerCase();
  const e = expected.trim().toLowerCase();
  switch (operator) {
    case "equals":
      return a === e;
    case "not_equals":
      return a !== e;
    case "contains":
      return e.length > 0 && a.includes(e);
    case "is_empty":
      return a.length === 0;
    case "is_not_empty":
      return a.length > 0;
  }
}

export function evaluateRule(rule: ConditionRule, scope: EvalScope): boolean {
  switch (rule.kind) {
    case "message_contains": {
      const norm = (s: string) => (rule.caseSensitive ? s : s.toLowerCase());
      const msg = norm(scope.message);
      const tokens = new Set(words(msg));
      return rule.keywords.some((k) => {
        const kw = norm(k.trim());
        return kw.includes(" ") ? msg.includes(kw) : tokens.has(kw);
      });
    }
    case "variable":
      return compare(resolvePath(scope, rule.variable), rule.operator, rule.value);
    case "has_tag":
      return scope.tags.some((t) => t.toLowerCase() === rule.tag.trim().toLowerCase());
    case "contact_field":
      return compare(contactField(scope, rule.field), rule.operator, rule.value);
  }
}

export function evaluateCondition(config: ConditionConfig, scope: EvalScope): { result: boolean; rules: boolean[] } {
  const rules = config.rules.map((r) => evaluateRule(r, scope));
  const result = config.combinator === "any" ? rules.some(Boolean) : rules.every(Boolean);
  return { result, rules };
}

// ─── Capture ────────────────────────────────────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

export function extractEmail(text: string): string | null {
  const m = text.match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

/** Finds a plausible phone number (7–15 digits, optional +, spaces, dashes, parentheses). */
export function extractPhone(text: string): string | null {
  const candidates = text.match(/\+?[\d\s().-]{7,}/g) ?? [];
  for (const c of candidates) {
    const digits = c.replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15) return (c.trim().startsWith("+") ? "+" : "") + digits;
  }
  return null;
}

export function emptyScope(): EvalScope {
  return {
    contact: { first_name: "", last_name: "", email: "", phone: "", lead_status: "new", notes: "", custom: {} },
    tags: [],
    message: "",
    vars: {},
  };
}
