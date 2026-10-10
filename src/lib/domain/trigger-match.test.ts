import { describe, expect, it } from "vitest";
import { matchesTrigger } from "./trigger-match";

const base = { keywords: [], phrases: [], phraseMatch: "contains" as const, caseSensitive: false };

describe("matchesTrigger", () => {
  it("matches keywords as whole words, case-insensitively", () => {
    const c = { ...base, kind: "keyword" as const, keywords: ["course"] };
    expect(matchesTrigger(c, "Send me the COURSE please")).toBe(true);
    expect(matchesTrigger(c, "courses")).toBe(false);
    expect(matchesTrigger(c, "COURSE!")).toBe(true);
  });
  it("supports Cyrillic and multi-word keywords", () => {
    expect(matchesTrigger({ ...base, kind: "keyword", keywords: ["курс"] }, "Хочу курс!")).toBe(true);
    expect(matchesTrigger({ ...base, kind: "keyword", keywords: ["free guide"] }, "is the free guide ready?")).toBe(true);
    expect(matchesTrigger({ ...base, kind: "keyword", keywords: ["free guide"] }, "free for a guide")).toBe(false);
  });
  it("respects case sensitivity", () => {
    expect(matchesTrigger({ ...base, kind: "keyword", keywords: ["VIP"], caseSensitive: true }, "vip")).toBe(false);
  });
  it("matches phrases by mode", () => {
    const p = { ...base, kind: "phrase" as const, phrases: ["book a call"] };
    expect(matchesTrigger(p, "Can I book a call tomorrow?")).toBe(true);
    expect(matchesTrigger({ ...p, phraseMatch: "exact" }, "book a call")).toBe(true);
    expect(matchesTrigger({ ...p, phraseMatch: "exact" }, "book a call now")).toBe(false);
    expect(matchesTrigger({ ...p, phraseMatch: "starts_with" }, "Book a call now")).toBe(true);
  });
  it("handles message-agnostic triggers", () => {
    expect(matchesTrigger({ ...base, kind: "incoming_message" }, "hi")).toBe(true);
    expect(matchesTrigger({ ...base, kind: "incoming_message" }, "   ")).toBe(false);
    expect(matchesTrigger({ ...base, kind: "manual" }, "hi")).toBe(false);
  });
});
