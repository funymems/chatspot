import type { ActionDef, ConditionRule, NodeType } from "./schema";

/** Starting configuration for a freshly added node of each type. */
export function defaultNodeData(type: NodeType): Record<string, unknown> {
  switch (type) {
    case "trigger":
      return { kind: "keyword", keywords: [], phrases: [], phraseMatch: "contains", caseSensitive: false, eventName: "", sampleInput: "" };
    case "message":
      return {
        messages: [{ id: "m1", text: "" }],
        quickReplies: [],
        linkButtons: [],
        delaySeconds: 0,
        waitForReply: false,
        saveReplyAs: "",
        replyTimeoutSeconds: 0,
      };
    case "condition":
      return { rules: [defaultRule("message_contains")], combinator: "all" };
    case "action":
      return { action: defaultAction("add_tag") };
    case "ai_response":
      return { agentId: "", instructions: "", knowledgeContext: "", fallback: "agent_default", fallbackMessage: "", saveReplyAs: "" };
    case "note":
      return { text: "", color: "yellow" };
    case "end":
      return { outcome: "completed", label: "" };
  }
}

export function defaultRule(kind: ConditionRule["kind"]): ConditionRule {
  switch (kind) {
    case "message_contains":
      return { kind, keywords: [], caseSensitive: false };
    case "variable":
      return { kind, variable: "", operator: "equals", value: "" };
    case "has_tag":
      return { kind, tag: "" };
    case "contact_field":
      return { kind, field: "", operator: "equals", value: "" };
  }
}

export function defaultAction(kind: ActionDef["kind"]): ActionDef {
  switch (kind) {
    case "add_tag":
    case "remove_tag":
      return { kind, tag: "" };
    case "set_field":
      return { kind, field: "", value: "" };
    case "capture":
      return { kind, target: "email", source: "last_message", variable: "" };
    case "wait":
      return { kind, seconds: 60 };
    case "redirect":
      return { kind, automationId: "" };
    case "log_event":
      return { kind, eventName: "", note: "" };
    case "mark_qualified":
      return { kind };
  }
}
