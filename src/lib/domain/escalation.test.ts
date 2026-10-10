import { describe, expect, it } from "vitest";
import { detectEscalation } from "./escalation";

const rules = { keywords: ["refund now", "complaint"], onNoAnswer: false, onExplicitRequest: true };

describe("detectEscalation", () => {
  it("detects explicit requests for a person in English and Russian", () => {
    expect(detectEscalation("Can I talk to a human please?", rules)).toMatch(/с человеком/);
    expect(detectEscalation("Позовите менеджера", rules)).toMatch(/с человеком/);
    expect(detectEscalation("хочу поговорить с человеком", rules)).toMatch(/с человеком/);
  });
  it("detects configured keywords as phrases", () => {
    expect(detectEscalation("I want a REFUND NOW!", rules)).toMatch(/refund now/);
    expect(detectEscalation("refund policy?", rules)).toBeNull();
  });
  it("respects the explicit-request switch", () => {
    expect(detectEscalation("operator please", { ...rules, onExplicitRequest: false })).toBeNull();
  });
  it("ignores ordinary questions", () => {
    expect(detectEscalation("What are your opening hours?", rules)).toBeNull();
  });
});
