import { words } from "./trigger-match";

export type EscalationRules = { keywords: string[]; onNoAnswer: boolean; onExplicitRequest: boolean };

// Phrases that clearly ask for a person (EN + RU). Matched on word tokens.
const EXPLICIT_PATTERNS: string[][] = [
  ["human"],
  ["real", "person"],
  ["live", "agent"],
  ["operator"],
  ["manager"],
  ["representative"],
  ["someone", "from", "your", "team"],
  ["talk", "to", "a", "person"],
  ["оператор"],
  ["оператора"],
  ["человек"],
  ["человеком"],
  ["менеджер"],
  ["менеджера"],
  ["живой"],
  ["сотрудник"],
  ["сотрудника"],
];

function containsSequence(tokens: string[], seq: string[]) {
  outer: for (let i = 0; i <= tokens.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) if (tokens[i + j] !== seq[j]) continue outer;
    return true;
  }
  return false;
}

/** Returns why a message should be handed to a human, or null. */
export function detectEscalation(message: string, rules: EscalationRules): string | null {
  const tokens = words(message.toLowerCase());
  const keyword = rules.keywords.find((k) => {
    const kw = words(k.toLowerCase());
    return kw.length > 0 && containsSequence(tokens, kw);
  });
  if (keyword) return `В сообщении есть стоп-слово для передачи человеку: «${keyword}»`;
  if (rules.onExplicitRequest && EXPLICIT_PATTERNS.some((p) => containsSequence(tokens, p))) {
    return "Клиент попросил поговорить с человеком";
  }
  return null;
}
