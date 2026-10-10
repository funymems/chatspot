import "server-only";
import type { WorkspaceContext } from "@/lib/server/auth/context";
import { getAiProvider, type ChatTurn } from "@/lib/server/ai/provider";
import { logger } from "@/lib/server/logger";
import { draftGraphSchema, repairDraft } from "@/lib/domain/graph/repair";
import { validateGraph, type GraphIssue } from "@/lib/domain/graph/validate";
import type { AutomationGraph } from "@/lib/domain/graph/schema";
import { generateDemoFlow } from "@/lib/domain/demo-flow-generator";
import { listAgentOptions } from "./agents";
import { listAutomationOptions } from "./automations";

export type GeneratedFlow = {
  name: string;
  description: string;
  graph: AutomationGraph;
  issues: GraphIssue[];
  valid: boolean;
  fixes: string[];
  provider: string;
};

const responseJsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["trigger", "message", "condition", "action", "ai_response", "end"] },
          label: { type: "string" },
          config_json: { type: "string", description: "The node configuration as a JSON object string." },
        },
        required: ["id", "type", "config_json"],
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          handle: { type: "string", enum: ["out", "true", "false"] },
        },
        required: ["source", "target", "handle"],
      },
    },
  },
  required: ["name", "description", "nodes", "edges"],
};

function systemPrompt(agents: { id: string; name: string }[], automations: { id: string; name: string }[]) {
  return `You design chat automation flows for a messaging automation platform. Convert the user's description into a flow graph.

Node types and their config_json (a JSON object string):
- trigger (exactly one): {"kind":"keyword","keywords":["COURSE"],"caseSensitive":false} | {"kind":"phrase","phrases":["book a call"],"phraseMatch":"contains"|"exact"|"starts_with"} | {"kind":"incoming_message"} | {"kind":"manual"}. Also set "sampleInput" to an example message.
- message: {"messages":[{"id":"m1","text":"..."}],"quickReplies":[{"id":"q1","label":"Beginner"}],"linkButtons":[{"id":"b1","label":"Open","url":"https://..."}],"delaySeconds":0,"waitForReply":false,"saveReplyAs":""}. To ask a question and use the answer later, set waitForReply=true and saveReplyAs to a variable name (letters, digits, underscores).
- condition: {"combinator":"all"|"any","rules":[...]} where a rule is {"kind":"message_contains","keywords":["yes"]} | {"kind":"variable","variable":"course_choice","operator":"equals"|"not_equals"|"contains"|"is_empty"|"is_not_empty","value":"beginner"} | {"kind":"has_tag","tag":"vip"} | {"kind":"contact_field","field":"email","operator":"is_not_empty","value":""}. Conditions have two outputs: handle "true" and handle "false".
- action: {"action":{...}} with one of {"kind":"add_tag","tag":"lead"} | {"kind":"remove_tag","tag":"x"} | {"kind":"set_field","field":"course_interest","value":"{{course_choice}}"} | {"kind":"capture","target":"email"|"phone","source":"last_message"|"variable","variable":"email_reply"} | {"kind":"wait","seconds":3600} | {"kind":"log_event","eventName":"lead_captured","note":""} | {"kind":"mark_qualified"}${automations.length ? ` | {"kind":"redirect","automationId":"<one of: ${automations.map((a) => `${a.id} (${a.name})`).join(", ")}>"}` : ""}.
- ai_response: ${agents.length ? `{"agentId":"<one of: ${agents.map((a) => `${a.id} (${a.name})`).join(", ")}>","instructions":"","fallback":"agent_default"}` : "NOT AVAILABLE (no AI agents exist) — do not use."}
- end: {"outcome":"completed"|"goal_reached"|"handoff","label":"..."}

Rules:
- Exactly one trigger. Every non-end node's outputs must connect to the next node (edges use handle "out", or "true"/"false" for conditions). Every path must finish at an end node.
- Use {{contact.first_name}}, {{message.text}} or saved variables like {{course_choice}} in texts where useful.
- Write customer-facing texts in the same language as the description, short and friendly.
- If the description mentions links you don't know, use https://example.com/... placeholders.
- Do not invent features not listed above. Output only the JSON object.`;
}

/**
 * Generates a draft automation graph from a natural-language description.
 * The result is never activated; callers save it as a draft.
 */
export async function generateFlow(ctx: WorkspaceContext, description: string): Promise<GeneratedFlow> {
  const [agents, automations] = await Promise.all([listAgentOptions(ctx), listAutomationOptions(ctx)]);
  const refCtx = { agentIds: new Set(agents.map((a) => a.id)), automationIds: new Set(automations.map((a) => a.id)) };
  const provider = getAiProvider();

  if (!provider) {
    const demo = generateDemoFlow(description);
    const v = validateGraph(demo.graph, refCtx);
    return { ...demo, graph: v.graph ?? demo.graph, issues: v.issues, valid: v.valid, fixes: [], provider: "demo" };
  }

  const system = systemPrompt(agents, automations);
  const conversation: ChatTurn[] = [{ role: "user", text: `Build an automation for this description:\n\n${description}` }];
  let attempt = 0;
  let last: GeneratedFlow | null = null;

  while (attempt < 2) {
    attempt++;
    const res = await provider.generate({ system, messages: conversation, jsonSchema: responseJsonSchema, temperature: 0.2, maxOutputTokens: 6000, timeoutMs: 45_000 });
    let draft;
    try {
      draft = draftGraphSchema.parse(JSON.parse(res.text));
    } catch (err) {
      logger.warn("flowgen.unparseable", { attempt, err });
      conversation.push({ role: "assistant", text: res.text.slice(0, 4000) }, { role: "user", text: "That was not valid JSON matching the schema. Return only the JSON object." });
      continue;
    }
    const { graph, fixes } = repairDraft(draft);
    const v = validateGraph(graph, refCtx);
    last = { name: draft.name.slice(0, 120) || "Generated automation", description: draft.description.slice(0, 500), graph: v.graph ?? graph, issues: v.issues, valid: v.valid, fixes, provider: `gemini:${provider.model}` };
    if (v.valid) return last;
    // One repair round: send the validator's findings back to the model.
    conversation.push(
      { role: "assistant", text: res.text.slice(0, 8000) },
      { role: "user", text: `The flow has these problems. Fix them and return the full corrected JSON:\n${v.issues.filter((i) => i.severity === "error").map((i) => `- ${i.message}`).join("\n")}` },
    );
  }
  if (last) return last;
  throw new Error("The AI couldn't produce a usable flow. Try describing it in more detail.");
}
