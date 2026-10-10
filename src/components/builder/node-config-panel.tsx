"use client";

import { Copy, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type {
  ActionDef,
  AiResponseConfig,
  ConditionConfig,
  ConditionRule,
  EndConfig,
  GraphNode,
  MessageConfig,
  NoteConfig,
  TriggerConfig,
} from "@/lib/domain/graph/schema";
import { compareOperators } from "@/lib/domain/graph/schema";
import type { GraphIssue } from "@/lib/domain/graph/validate";
import { nodeMeta } from "@/components/flow/node-meta";
import { matchesTrigger } from "@/lib/domain/trigger-match";
import { cn } from "@/lib/utils";
import { defaultAction, defaultRule } from "./defaults";
import { newId } from "./state";
import {
  DurationField,
  FieldRow,
  ListEditor,
  SelectField,
  SwitchField,
  TagListField,
  TextAreaField,
  TextField,
} from "./fields";

export type RefOption = { id: string; name: string };

type Props = {
  node: GraphNode;
  issues: GraphIssue[];
  variables: string[];
  agents: RefOption[];
  automations: RefOption[];
  /** `field` identifies the edited field so rapid typing coalesces in history. */
  onChange: (data: Record<string, unknown>, field: string) => void;
  onLabel: (label: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
};

export function NodeConfigPanel(props: Props) {
  const { node, issues } = props;
  const meta = nodeMeta[node.type];
  const Icon = meta.icon;
  const nodeIssues = issues.filter((i) => i.nodeId === node.id);
  const general = nodeIssues.filter((i) => !i.path);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className={cn("flex size-7 items-center justify-center rounded-md", meta.accent)}>
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{meta.label}</p>
          <p className="truncate text-xs text-muted-foreground">{meta.description}</p>
        </div>
        {node.type !== "trigger" && (
          <Button variant="ghost" size="icon-sm" onClick={props.onDuplicate} aria-label="Duplicate node" title="Duplicate (Ctrl+D)">
            <Copy />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={props.onDelete} aria-label="Delete node" title="Delete (Del)" className="hover:text-destructive">
          <Trash2 />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={props.onClose} aria-label="Close panel">
          <X />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <TextField label="Display name (optional)" value={node.label ?? ""} onChange={props.onLabel} placeholder={meta.label} />
        {general.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs">
            {general.map((i, k) => (
              <li key={k} className={i.severity === "error" ? "text-destructive" : "text-amber-700"}>
                {i.message}
              </li>
            ))}
          </ul>
        )}
        <Separator />
        <TypeForm {...props} />
      </div>
    </div>
  );
}

function useErrors(issues: GraphIssue[], nodeId: string) {
  return (path: string) => issues.find((i) => i.nodeId === nodeId && i.path && (i.path === path || i.path.startsWith(`${path}.`)))?.message.replace(/^[^:]+: /, "");
}

function TypeForm(props: Props) {
  switch (props.node.type) {
    case "trigger":
      return <TriggerForm {...props} />;
    case "message":
      return <MessageForm {...props} />;
    case "condition":
      return <ConditionForm {...props} />;
    case "action":
      return <ActionForm {...props} />;
    case "ai_response":
      return <AiForm {...props} />;
    case "note":
      return <NoteForm {...props} />;
    case "end":
      return <EndForm {...props} />;
  }
}

// ─── Trigger ────────────────────────────────────────────────────────────────

function TriggerForm({ node, issues, onChange }: Props) {
  const d = node.data as TriggerConfig;
  const err = useErrors(issues, node.id);
  const set = (patch: Partial<TriggerConfig>, field: string) => onChange({ ...d, ...patch }, field);
  return (
    <div className="space-y-4">
      <SelectField
        label="Starts when"
        value={d.kind}
        onChange={(kind) => set({ kind }, "kind")}
        options={[
          { value: "keyword", label: "Message contains a keyword" },
          { value: "phrase", label: "Message matches a phrase" },
          { value: "incoming_message", label: "Any incoming message" },
          { value: "manual", label: "Manual test run" },
          { value: "webhook", label: "Webhook / test event" },
        ]}
      />
      {d.kind === "keyword" && (
        <TagListField
          label="Keywords"
          values={d.keywords ?? []}
          onChange={(keywords) => set({ keywords }, "keywords")}
          error={err("keywords") ?? issues.find((i) => i.nodeId === node.id && i.code === "trigger_keywords")?.message}
          hint="Matches whole words, e.g. COURSE matches “send me the course”."
        />
      )}
      {d.kind === "phrase" && (
        <>
          <SelectField
            label="Match mode"
            value={d.phraseMatch}
            onChange={(phraseMatch) => set({ phraseMatch }, "phraseMatch")}
            options={[
              { value: "contains", label: "Message contains the phrase" },
              { value: "exact", label: "Message is exactly the phrase" },
              { value: "starts_with", label: "Message starts with the phrase" },
            ]}
          />
          <TagListField
            label="Phrases"
            values={d.phrases ?? []}
            onChange={(phrases) => set({ phrases }, "phrases")}
            error={err("phrases") ?? issues.find((i) => i.nodeId === node.id && i.code === "trigger_phrases")?.message}
          />
        </>
      )}
      {(d.kind === "keyword" || d.kind === "phrase") && (
        <SwitchField label="Case sensitive" checked={d.caseSensitive} onChange={(caseSensitive) => set({ caseSensitive }, "caseSensitive")} />
      )}
      {d.kind === "webhook" && (
        <TextField
          label="Event name"
          value={d.eventName}
          onChange={(eventName) => set({ eventName }, "eventName")}
          placeholder="inquiry_received"
          error={err("eventName") ?? issues.find((i) => i.nodeId === node.id && i.code === "trigger_event")?.message}
          hint="Generic event for future integrations. Fired from the test runner for now."
        />
      )}
      <TextAreaField
        label="Sample input for testing"
        value={d.sampleInput}
        onChange={(sampleInput) => set({ sampleInput }, "sampleInput")}
        rows={2}
        placeholder="e.g. Hi, I want the COURSE"
        hint={<TriggerMatchPreview config={d} />}
      />
    </div>
  );
}

/** Live check of whether the sample input would start this flow (mirrors the engine's matcher). */
function TriggerMatchPreview({ config }: { config: TriggerConfig }) {
  if (config.kind === "manual" || config.kind === "webhook") return <>Used as the incoming message in test runs.</>;
  if (!config.sampleInput) return <>Type a sample message to check whether it would trigger this flow.</>;
  const matches = matchesTrigger(config, config.sampleInput);
  return (
    <span className={matches ? "text-success" : "text-amber-700"}>
      {matches ? "✓ This sample would start the flow" : "✗ This sample would not start the flow"}
    </span>
  );
}

// ─── Message ────────────────────────────────────────────────────────────────

function VariableChips({ variables, onInsert }: { variables: string[]; onInsert: (token: string) => void }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span>Insert:</span>
      {variables.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onInsert(`{{${v}}}`)}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/80 hover:bg-accent hover:text-accent-foreground"
        >
          {v}
        </button>
      ))}
    </span>
  );
}

function MessageForm({ node, issues, onChange, variables }: Props) {
  const d = node.data as MessageConfig;
  const err = useErrors(issues, node.id);
  const set = (patch: Partial<MessageConfig>, field: string) => onChange({ ...d, ...patch }, field);
  return (
    <div className="space-y-5">
      <ListEditor
        label="Messages (sent in order)"
        items={d.messages ?? []}
        max={10}
        addLabel="Add message"
        error={err("messages") && !d.messages?.length ? err("messages") : undefined}
        create={() => ({ id: newId("m"), text: "" })}
        onChange={(messages) => set({ messages }, "messages")}
        render={(m, update, i) => (
          <div className="space-y-1">
            <textarea
              value={m.text}
              rows={3}
              onChange={(e) => update({ ...m, text: e.target.value })}
              aria-label={`Message ${i + 1}`}
              aria-invalid={err(`messages.${i}.text`) || issues.some((x) => x.nodeId === node.id && x.path === `messages.${i}.text`) ? true : undefined}
              placeholder="Hi {{contact.first_name}}!"
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
            />
            {issues.find((x) => x.nodeId === node.id && x.path === `messages.${i}.text`) && (
              <p className="text-xs text-destructive">This message is empty</p>
            )}
            <div className="text-xs text-muted-foreground">
              <VariableChips variables={variables} onInsert={(token) => update({ ...m, text: `${m.text}${m.text && !m.text.endsWith(" ") ? " " : ""}${token}` })} />
            </div>
          </div>
        )}
      />

      <ListEditor
        label="Quick-reply buttons"
        items={d.quickReplies ?? []}
        max={10}
        addLabel="Add quick reply"
        create={() => ({ id: newId("q"), label: "" })}
        onChange={(quickReplies) => set({ quickReplies }, "quickReplies")}
        render={(q, update, i) => (
          <Input value={q.label} maxLength={40} onChange={(e) => update({ ...q, label: e.target.value })} placeholder="Button label" aria-label={`Quick reply ${i + 1}`} aria-invalid={err(`quickReplies.${i}`) ? true : undefined} />
        )}
      />

      <ListEditor
        label="Link buttons"
        items={d.linkButtons ?? []}
        max={3}
        addLabel="Add link button"
        create={() => ({ id: newId("b"), label: "", url: "https://" })}
        onChange={(linkButtons) => set({ linkButtons }, "linkButtons")}
        render={(b, update, i) => (
          <div className="grid gap-1.5">
            <Input value={b.label} maxLength={40} onChange={(e) => update({ ...b, label: e.target.value })} placeholder="Label" aria-label={`Link ${i + 1} label`} />
            <Input value={b.url} onChange={(e) => update({ ...b, url: e.target.value })} placeholder="https://…" aria-label={`Link ${i + 1} URL`} aria-invalid={err(`linkButtons.${i}.url`) ? true : undefined} />
            {err(`linkButtons.${i}`) && <p className="text-xs text-destructive">{err(`linkButtons.${i}`)}</p>}
          </div>
        )}
      />

      <DurationField
        label="Delay before sending"
        seconds={d.delaySeconds ?? 0}
        onChange={(delaySeconds) => set({ delaySeconds }, "delaySeconds")}
        hint="Delays are scheduled as background jobs, never by holding a request open."
      />

      <SwitchField
        label="Wait for reply"
        description="Pause the run until the contact answers."
        checked={d.waitForReply ?? false}
        onChange={(waitForReply) => set({ waitForReply }, "waitForReply")}
      />
      {d.waitForReply && (
        <>
          <TextField
            label="Save reply as variable"
            value={d.saveReplyAs ?? ""}
            onChange={(saveReplyAs) => set({ saveReplyAs }, "saveReplyAs")}
            placeholder="course_choice"
            error={err("saveReplyAs")}
            hint={d.saveReplyAs ? <>Use it later as <code>{`{{${d.saveReplyAs}}}`}</code></> : "Optional. Letters, numbers and underscores."}
          />
          <DurationField
            label="Stop waiting after (0 = no timeout)"
            seconds={d.replyTimeoutSeconds ?? 0}
            onChange={(replyTimeoutSeconds) => set({ replyTimeoutSeconds }, "replyTimeoutSeconds")}
          />
        </>
      )}
    </div>
  );
}

// ─── Condition ──────────────────────────────────────────────────────────────

const operatorOptions = compareOperators.map((o) => ({ value: o, label: o.replace(/_/g, " ") }));

function ConditionForm({ node, issues, onChange }: Props) {
  const d = node.data as ConditionConfig;
  const err = useErrors(issues, node.id);
  const set = (patch: Partial<ConditionConfig>, field: string) => onChange({ ...d, ...patch }, field);
  return (
    <div className="space-y-4">
      <SelectField
        label="Match"
        value={d.combinator ?? "all"}
        onChange={(combinator) => set({ combinator }, "combinator")}
        options={[
          { value: "all", label: "All rules (AND)" },
          { value: "any", label: "Any rule (OR)" },
        ]}
      />
      <ListEditor<ConditionRule>
        label="Rules"
        items={d.rules ?? []}
        max={10}
        addLabel="Add rule"
        error={!d.rules?.length ? err("rules") : undefined}
        create={() => defaultRule("message_contains")}
        onChange={(rules) => set({ rules }, "rules")}
        render={(rule, update, i) => <RuleEditor rule={rule} onChange={update} error={(p) => err(`rules.${i}.${p}`)} />}
      />
      <p className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
        Connect the <span className="font-medium text-success">Yes</span> output for when the rules match and the{" "}
        <span className="font-medium text-destructive">No</span> output for everything else.
      </p>
    </div>
  );
}

function RuleEditor({ rule, onChange, error }: { rule: ConditionRule; onChange: (r: ConditionRule) => void; error: (path: string) => string | undefined }) {
  return (
    <div className="space-y-2 rounded-lg border p-2.5">
      <SelectField
        label="Rule"
        value={rule.kind}
        onChange={(kind) => onChange(defaultRule(kind))}
        options={[
          { value: "message_contains", label: "Message contains keyword" },
          { value: "variable", label: "Variable compares to value" },
          { value: "has_tag", label: "Contact has tag" },
          { value: "contact_field", label: "Contact field compares to value" },
        ]}
      />
      {rule.kind === "message_contains" && (
        <TagListField label="Keywords" values={rule.keywords} onChange={(keywords) => onChange({ ...rule, keywords })} error={error("keywords")} />
      )}
      {rule.kind === "has_tag" && <TextField label="Tag" value={rule.tag} onChange={(tag) => onChange({ ...rule, tag })} error={error("tag")} placeholder="vip" />}
      {(rule.kind === "variable" || rule.kind === "contact_field") && (
        <>
          {rule.kind === "variable" ? (
            <TextField label="Variable" value={rule.variable} onChange={(variable) => onChange({ ...rule, variable })} error={error("variable")} placeholder="course_choice" />
          ) : (
            <TextField label="Contact field" value={rule.field} onChange={(field) => onChange({ ...rule, field })} error={error("field")} placeholder="email, first_name or a custom field" />
          )}
          <SelectField label="Operator" value={rule.operator} onChange={(operator) => onChange({ ...rule, operator })} options={operatorOptions} />
          {rule.operator !== "is_empty" && rule.operator !== "is_not_empty" && (
            <TextField label="Value" value={rule.value} onChange={(value) => onChange({ ...rule, value })} error={error("value")} />
          )}
        </>
      )}
    </div>
  );
}

// ─── Action ─────────────────────────────────────────────────────────────────

function ActionForm({ node, issues, onChange, automations }: Props) {
  const a = (node.data as { action: ActionDef }).action;
  const err = useErrors(issues, node.id);
  const set = (action: ActionDef, field: string) => onChange({ action }, field);
  const issue = (code: string) => issues.find((i) => i.nodeId === node.id && i.code === code)?.message;
  return (
    <div className="space-y-4">
      <SelectField
        label="Action"
        value={a.kind}
        onChange={(kind) => set(defaultAction(kind), "kind")}
        options={[
          { value: "add_tag", label: "Add a contact tag" },
          { value: "remove_tag", label: "Remove a contact tag" },
          { value: "set_field", label: "Set a contact field" },
          { value: "capture", label: "Capture email or phone" },
          { value: "wait", label: "Wait" },
          { value: "redirect", label: "Redirect to another flow" },
          { value: "log_event", label: "Log an event" },
          { value: "mark_qualified", label: "Mark lead as qualified" },
        ]}
      />
      {(a.kind === "add_tag" || a.kind === "remove_tag") && (
        <TextField label="Tag" value={a.tag} onChange={(tag) => set({ ...a, tag }, "tag")} error={err("action.tag")} placeholder="interested" />
      )}
      {a.kind === "set_field" && (
        <>
          <TextField
            label="Field"
            value={a.field}
            onChange={(field) => set({ ...a, field }, "field")}
            error={err("action.field")}
            placeholder="course_interest"
            hint="Built-in: first_name, last_name, email, phone, notes. Anything else becomes a custom field."
          />
          <TextField label="Value" value={a.value} onChange={(value) => set({ ...a, value }, "value")} error={err("action.value")} hint="Variables like {{course_choice}} are supported." />
        </>
      )}
      {a.kind === "capture" && (
        <>
          <SelectField
            label="Capture"
            value={a.target}
            onChange={(target) => set({ ...a, target }, "target")}
            options={[
              { value: "email", label: "Email address" },
              { value: "phone", label: "Phone number" },
            ]}
          />
          <SelectField
            label="Read from"
            value={a.source}
            onChange={(source) => set({ ...a, source }, "source")}
            options={[
              { value: "last_message", label: "The latest incoming message" },
              { value: "variable", label: "A saved variable" },
            ]}
          />
          {a.source === "variable" && (
            <TextField label="Variable" value={a.variable} onChange={(variable) => set({ ...a, variable }, "variable")} error={issue("capture_variable")} placeholder="email_reply" />
          )}
          <p className="text-xs text-muted-foreground">If a valid value is found it is saved on the contact; check it later with a Condition.</p>
        </>
      )}
      {a.kind === "wait" && (
        <DurationField label="Wait for" seconds={a.seconds} min={1} onChange={(seconds) => set({ ...a, seconds }, "seconds")} error={err("action.seconds")} hint="Runs resume from a background job." />
      )}
      {a.kind === "redirect" && (
        <SelectField
          label="Continue in automation"
          value={a.automationId}
          onChange={(automationId) => set({ ...a, automationId }, "automationId")}
          options={automations.map((x) => ({ value: x.id, label: x.name }))}
          placeholder={automations.length ? "Choose an automation" : "No other automations yet"}
          error={err("action.automationId") ?? issue("redirect_missing") ?? issue("redirect_self")}
        />
      )}
      {a.kind === "log_event" && (
        <>
          <TextField label="Event name" value={a.eventName} onChange={(eventName) => set({ ...a, eventName }, "eventName")} error={err("action.eventName")} placeholder="booking_requested" />
          <TextAreaField label="Note" value={a.note} onChange={(note) => set({ ...a, note }, "note")} rows={2} />
        </>
      )}
      {a.kind === "mark_qualified" && <p className="text-sm text-muted-foreground">Sets the contact&apos;s lead status to Qualified.</p>}
    </div>
  );
}

// ─── AI response ────────────────────────────────────────────────────────────

function AiForm({ node, issues, onChange, agents }: Props) {
  const d = node.data as AiResponseConfig;
  const err = useErrors(issues, node.id);
  const set = (patch: Partial<AiResponseConfig>, field: string) => onChange({ ...d, ...patch }, field);
  return (
    <div className="space-y-4">
      <SelectField
        label="AI agent"
        value={d.agentId}
        onChange={(agentId) => set({ agentId }, "agentId")}
        options={agents.map((a) => ({ value: a.id, label: a.name }))}
        placeholder={agents.length ? "Choose an agent" : "No agents yet"}
        error={err("agentId") ?? issues.find((i) => i.nodeId === node.id && i.code === "agent_missing")?.message}
        hint={agents.length ? undefined : "AI agents are created on the AI Agents page (stage 6)."}
      />
      <TextAreaField label="Node-specific instructions" value={d.instructions} onChange={(instructions) => set({ instructions }, "instructions")} rows={3} placeholder="Keep it short and suggest the beginner course." />
      <TextAreaField label="Knowledge context" value={d.knowledgeContext} onChange={(knowledgeContext) => set({ knowledgeContext }, "knowledgeContext")} rows={2} hint="Extra context added to what the agent retrieves from its knowledge base." />
      <SelectField
        label="If the agent can't answer"
        value={d.fallback}
        onChange={(fallback) => set({ fallback }, "fallback")}
        options={[
          { value: "agent_default", label: "Use the agent's fallback response" },
          { value: "custom_message", label: "Send a custom message" },
          { value: "handoff", label: "Hand off to a human" },
        ]}
      />
      {d.fallback === "custom_message" && (
        <TextAreaField label="Fallback message" value={d.fallbackMessage} onChange={(fallbackMessage) => set({ fallbackMessage }, "fallbackMessage")} rows={2} error={err("fallbackMessage")} />
      )}
      <TextField label="Save reply as variable (optional)" value={d.saveReplyAs} onChange={(saveReplyAs) => set({ saveReplyAs }, "saveReplyAs")} error={err("saveReplyAs")} placeholder="ai_answer" />
    </div>
  );
}

// ─── Note & End ─────────────────────────────────────────────────────────────

function NoteForm({ node, onChange }: Props) {
  const d = node.data as NoteConfig;
  return (
    <div className="space-y-4">
      <TextAreaField label="Note" value={d.text} onChange={(text) => onChange({ ...d, text }, "text")} rows={6} hint="Notes are annotations for your team and never run." />
      <FieldRow label="Color">
        <div className="flex gap-2">
          {(["yellow", "blue", "green", "pink", "gray"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ ...d, color: c }, "color")}
              aria-label={c}
              aria-pressed={d.color === c}
              className={cn(
                "size-6 rounded-full border-2",
                { yellow: "bg-yellow-200", blue: "bg-sky-200", green: "bg-emerald-200", pink: "bg-pink-200", gray: "bg-zinc-200" }[c],
                d.color === c ? "border-primary" : "border-transparent",
              )}
            />
          ))}
        </div>
      </FieldRow>
    </div>
  );
}

function EndForm({ node, onChange }: Props) {
  const d = node.data as EndConfig;
  return (
    <div className="space-y-4">
      <SelectField
        label="Result"
        value={d.outcome}
        onChange={(outcome) => onChange({ ...d, outcome }, "outcome")}
        options={[
          { value: "completed", label: "Completed" },
          { value: "goal_reached", label: "Goal reached (counts as a conversion)" },
          { value: "handoff", label: "Hand off to a human" },
        ]}
      />
      <TextField label="Result label" value={d.label} onChange={(label) => onChange({ ...d, label }, "label")} placeholder="Lead captured" />
    </div>
  );
}
