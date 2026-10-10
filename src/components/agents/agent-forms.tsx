"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SelectField, SwitchField, TagListField, TextAreaField, TextField } from "@/components/builder/fields";
import { deleteAgentAction, updateAgentAction } from "@/app/actions/agents";
import type { AgentView } from "./types";

type Errors = Record<string, string[] | undefined>;

function useSave(slug: string, agentId: string, section: "general" | "instructions" | "settings") {
  const [errors, setErrors] = useState<Errors>({});
  const [pending, start] = useTransition();
  const save = (values: unknown) =>
    start(async () => {
      const res = await updateAgentAction(slug, agentId, section, values);
      if (res.ok) {
        setErrors({});
        toast.success(res.message);
      } else {
        setErrors(res.fieldErrors ?? {});
        if (!res.fieldErrors) toast.error(res.error);
      }
    });
  const err = (k: string) => errors[k]?.[0];
  return { save, pending, err };
}

const languages = ["English", "Russian", "Kazakh", "Uzbek", "Spanish", "German", "French", "Turkish", "Arabic"];

export function GeneralForm({ slug, agent }: { slug: string; agent: AgentView }) {
  const [v, setV] = useState({
    name: agent.name,
    role: agent.role,
    description: agent.description,
    tone: agent.tone,
    languageMode: agent.languageMode,
    language: agent.language === "en" ? "English" : agent.language,
  });
  const { save, pending, err } = useSave(slug, agent.id, "general");
  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>Who the agent is and how it talks.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" value={v.name} onChange={(name) => setV({ ...v, name })} error={err("name")} />
        <SelectField
          label="Role"
          value={v.role}
          onChange={(role) => setV({ ...v, role })}
          options={[
            { value: "general", label: "General assistant" },
            { value: "support", label: "Customer support" },
            { value: "sales", label: "Sales assistant" },
          ]}
        />
        <div className="sm:col-span-2">
          <TextAreaField label="Description" value={v.description} onChange={(description) => setV({ ...v, description })} rows={2} error={err("description")} />
        </div>
        <SelectField
          label="Tone"
          value={v.tone as "friendly"}
          onChange={(tone) => setV({ ...v, tone })}
          options={["friendly", "professional", "casual", "concise", "enthusiastic"].map((t) => ({ value: t as "friendly", label: t[0]!.toUpperCase() + t.slice(1) }))}
        />
        <SelectField
          label="Response language"
          value={v.languageMode as "match_user"}
          onChange={(languageMode) => setV({ ...v, languageMode })}
          options={[
            { value: "match_user" as const, label: "Match the customer's language" },
            { value: "fixed" as "match_user", label: "Always use one language" },
          ]}
        />
        {v.languageMode === "fixed" && (
          <SelectField label="Language" value={v.language} onChange={(language) => setV({ ...v, language })} options={languages.map((l) => ({ value: l, label: l }))} error={err("language")} />
        )}
        <div className="sm:col-span-2">
          <Button onClick={() => save(v)} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function InstructionsForm({ slug, agent }: { slug: string; agent: AgentView }) {
  const [v, setV] = useState({ instructions: agent.instructions, businessInfo: agent.businessInfo });
  const { save, pending, err } = useSave(slug, agent.id, "instructions");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Instructions</CardTitle>
        <CardDescription>The agent follows these and never invents facts that aren&apos;t here or in the knowledge base.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <TextAreaField
          label="System instructions"
          value={v.instructions}
          onChange={(instructions) => setV({ ...v, instructions })}
          rows={8}
          error={err("instructions")}
          placeholder="You are a friendly assistant for Bloom Studio. Keep answers short. Suggest booking a free consultation when relevant."
        />
        <TextAreaField
          label="Business information"
          value={v.businessInfo}
          onChange={(businessInfo) => setV({ ...v, businessInfo })}
          rows={6}
          error={err("businessInfo")}
          hint="Short facts always available to the agent: what you sell, location, hours, contacts. Put longer material in the Knowledge Base."
        />
        <Button onClick={() => save(v)} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function SettingsForm({ slug, agent }: { slug: string; agent: AgentView }) {
  const router = useRouter();
  const [v, setV] = useState({
    fallbackResponse: agent.fallbackResponse,
    enabled: agent.enabled,
    escalationKeywords: agent.escalationRules.keywords,
    escalateOnNoAnswer: agent.escalationRules.onNoAnswer,
    escalateOnExplicitRequest: agent.escalationRules.onExplicitRequest,
  });
  const { save, pending, err } = useSave(slug, agent.id, "settings");
  const [confirm, setConfirm] = useState(false);
  const [deleting, startDelete] = useTransition();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Behaviour</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SwitchField label="Agent enabled" description="Disabled agents can't answer in automations." checked={v.enabled} onChange={(enabled) => setV({ ...v, enabled })} />
          <TextAreaField
            label="Fallback response"
            value={v.fallbackResponse}
            onChange={(fallbackResponse) => setV({ ...v, fallbackResponse })}
            rows={2}
            error={err("fallbackResponse")}
            hint="Sent when the answer isn't in the knowledge base."
          />
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Escalation to a human</p>
            <SwitchField
              label="When the customer asks for a person"
              description="E.g. “talk to a human”, “позовите менеджера”."
              checked={v.escalateOnExplicitRequest}
              onChange={(escalateOnExplicitRequest) => setV({ ...v, escalateOnExplicitRequest })}
            />
            <SwitchField label="When the agent can't answer" checked={v.escalateOnNoAnswer} onChange={(escalateOnNoAnswer) => setV({ ...v, escalateOnNoAnswer })} />
            <TagListField
              label="Escalation keywords"
              values={v.escalationKeywords}
              onChange={(escalationKeywords) => setV({ ...v, escalationKeywords })}
              hint="Messages containing these always go to a human (e.g. refund, complaint)."
            />
            <p className="text-xs text-muted-foreground">
              Hand-offs mark the conversation as “needs human” and create an in-app notification. No external alerts are sent.
            </p>
          </div>
          <Button onClick={() => save(v)} disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Delete agent</CardTitle>
          <CardDescription>Removes the agent, its knowledge base and unanswered questions. Automations using it will fail validation.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setConfirm(true)} disabled={deleting}>
            <Trash2 aria-hidden /> Delete agent
          </Button>
        </CardContent>
      </Card>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{agent.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the agent and its knowledge base. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() =>
                startDelete(async () => {
                  const res = await deleteAgentAction(slug, agent.id);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(res.message);
                  router.push(`/w/${slug}/agents`);
                })
              }
            >
              Delete agent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
