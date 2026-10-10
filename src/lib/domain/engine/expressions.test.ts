import { describe, expect, it } from "vitest";
import { emptyScope, evaluateCondition, evaluateRule, extractEmail, extractPhone, renderTemplate, type EvalScope } from "./expressions";

const scope = (): EvalScope => ({
  ...emptyScope(),
  contact: { ...emptyScope().contact, first_name: "Aida", email: "aida@example.com", custom: { course_interest: "advanced" } },
  tags: ["VIP", "course-lead"],
  message: "I want the Beginner course please",
  vars: { course_choice: "Beginner" },
});

describe("renderTemplate", () => {
  it("substitutes contact, message, custom fields and flow variables", () => {
    expect(renderTemplate("Hi {{contact.first_name}}! You chose {{ course_choice }} ({{contact.course_interest}})", scope())).toBe(
      "Hi Aida! You chose Beginner (advanced)",
    );
    expect(renderTemplate("You said: {{message.text}}", scope())).toBe("You said: I want the Beginner course please");
  });
  it("renders unknown variables as empty and never evaluates code", () => {
    expect(renderTemplate("x{{nope}}y", scope())).toBe("xy");
    expect(renderTemplate("{{constructor.constructor('return 1')()}}", scope())).toBe("{{constructor.constructor('return 1')()}}");
    expect(renderTemplate("{{__proto__}}", scope())).toBe("");
  });
});

describe("conditions", () => {
  it("evaluates each rule kind", () => {
    const s = scope();
    expect(evaluateRule({ kind: "message_contains", keywords: ["beginner"], caseSensitive: false }, s)).toBe(true);
    expect(evaluateRule({ kind: "message_contains", keywords: ["advanced"], caseSensitive: false }, s)).toBe(false);
    expect(evaluateRule({ kind: "variable", variable: "course_choice", operator: "equals", value: "beginner" }, s)).toBe(true);
    expect(evaluateRule({ kind: "variable", variable: "missing", operator: "is_empty", value: "" }, s)).toBe(true);
    expect(evaluateRule({ kind: "has_tag", tag: "vip" }, s)).toBe(true);
    expect(evaluateRule({ kind: "contact_field", field: "email", operator: "contains", value: "@example" }, s)).toBe(true);
    expect(evaluateRule({ kind: "contact_field", field: "phone", operator: "is_not_empty", value: "" }, s)).toBe(false);
  });
  it("combines rules with all/any", () => {
    const rules = [
      { kind: "has_tag" as const, tag: "vip" },
      { kind: "has_tag" as const, tag: "nope" },
    ];
    expect(evaluateCondition({ combinator: "all", rules }, scope()).result).toBe(false);
    expect(evaluateCondition({ combinator: "any", rules }, scope()).result).toBe(true);
  });
});

describe("capture", () => {
  it("extracts emails and phone numbers from free text", () => {
    expect(extractEmail("sure, it's John.Doe+x@Mail.example.org thanks")).toBe("john.doe+x@mail.example.org");
    expect(extractEmail("no email here")).toBeNull();
    expect(extractPhone("call me at +7 (701) 555-12-34 tomorrow")).toBe("+77015551234");
    expect(extractPhone("my order 123")).toBeNull();
  });
});
