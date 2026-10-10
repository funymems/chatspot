import { describe, expect, it } from "vitest";
import { buildSearchQuery, chunkText } from "./knowledge";

describe("chunkText", () => {
  it("keeps short documents whole", () => {
    expect(chunkText("  Opening hours: 9–18.  ")).toEqual(["Opening hours: 9–18."]);
    expect(chunkText("")).toEqual([]);
  });
  it("splits long documents into bounded chunks without losing text", () => {
    const paras = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} ` + "lorem ipsum dolor sit amet. ".repeat(8));
    const chunks = chunkText(paras.join("\n\n"), 600, 80);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.length <= 600 + 100)).toBe(true);
    for (let i = 0; i < 12; i++) expect(chunks.some((c) => c.includes(`Paragraph ${i} `))).toBe(true);
  });
});

describe("buildSearchQuery", () => {
  it("drops stopwords and joins terms with OR, using prefixes for inflections", () => {
    expect(buildSearchQuery("What are your opening hours?")).toBe("openi:* | hour:*");
    expect(buildSearchQuery("Сколько стоит курс?")).toBe("сколь:* | стои:* | курс:*");
  });
  it("returns null when nothing is searchable and strips operators", () => {
    expect(buildSearchQuery("hi! thanks")).toBeNull();
    expect(buildSearchQuery("price & (refund) | !x")).toBe("pric:* | refu:*");
  });
});
