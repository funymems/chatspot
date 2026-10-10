import { words } from "./trigger-match";

/**
 * Splits a document into retrieval chunks (~maxChars), preferring paragraph,
 * then sentence boundaries, with a small overlap so facts spanning a boundary
 * are still findable.
 */
export function chunkText(text: string, maxChars = 800, overlap = 120): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const pieces: string[] = [];
  for (const para of clean.split(/\n\s*\n/)) {
    if (para.length <= maxChars) {
      pieces.push(para.trim());
      continue;
    }
    // Long paragraph → split by sentences, hard-wrap if still too long.
    let buf = "";
    for (const sentence of para.split(/(?<=[.!?…])\s+/)) {
      if ((buf + " " + sentence).trim().length > maxChars && buf) {
        pieces.push(buf.trim());
        buf = "";
      }
      if (sentence.length > maxChars) {
        for (let i = 0; i < sentence.length; i += maxChars) pieces.push(sentence.slice(i, i + maxChars));
      } else {
        buf = `${buf} ${sentence}`;
      }
    }
    if (buf.trim()) pieces.push(buf.trim());
  }

  // Merge small pieces into chunks up to maxChars, adding overlap from the previous chunk.
  const chunks: string[] = [];
  let current = "";
  for (const p of pieces.filter(Boolean)) {
    if ((current ? current.length + 2 : 0) + p.length > maxChars && current) {
      chunks.push(current);
      const tail = current.slice(-overlap);
      current = `${tail.slice(tail.indexOf(" ") + 1)}\n\n${p}`;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

const STOPWORDS = new Set(
  (
    "a an the and or but if of to in on at for from by with about as is are was were be been being do does did have has had " +
    "i me my we our you your he she it its they them their this that these those what which who whom how when where why can could " +
    "would should will shall may might must not no yes please hi hello hey thanks thank there here any some " +
    "и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из " +
    "ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может " +
    "они тут где есть надо ней для мы тебя их чем была сам чтобы без будто чего раз тоже себе под будет ж тогда кто этот того потому " +
    "этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой " +
    "хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше " +
    "чуть том нельзя такой им более всегда конечно всю между здравствуйте привет пожалуйста спасибо"
  ).split(" "),
);

/**
 * Builds an OR tsquery from a natural-language question (Postgres `simple`
 * config). Returns null when the question has no searchable terms.
 * Terms are reduced to lowercase word tokens, so the output is safe to pass
 * to `to_tsquery` (no operators from user input survive).
 */
export function buildSearchQuery(question: string): string | null {
  const terms = [...new Set(words(question.toLowerCase()))]
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
    .slice(0, 12)
    // prefix match helps with simple inflections (price → prices, курс → курса)
    .map((w) => (w.length >= 4 ? `${w.slice(0, Math.max(4, w.length - 2))}:*` : w));
  return terms.length ? terms.join(" | ") : null;
}
