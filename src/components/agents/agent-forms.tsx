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

// Values stay in English: they go into the AI prompt ("Always reply in …").
const languages: { value: string; label: string }[] = [
  { value: "Russian", label: "Русский" },
  { value: "Kazakh", label: "Казахский" },
  { value: "English", label: "Английский" },
  { value: "Uzbek", label: "Узбекский" },
  { value: "Spanish", label: "Испанский" },
  { value: "German", label: "Немецкий" },
  { value: "French", label: "Французский" },
  { value: "Turkish", label: "Турецкий" },
  { value: "Arabic", label: "Арабский" },
];
const toneLabels: Record<string, string> = { friendly: "Дружелюбный", professional: "Профессиональный", casual: "Непринуждённый", concise: "Лаконичный", enthusiastic: "Воодушевлённый" };

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
        <CardTitle>Основное</CardTitle>
        <CardDescription>Кто этот агент и как он общается.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <TextField label="Имя" value={v.name} onChange={(name) => setV({ ...v, name })} error={err("name")} />
        <SelectField
          label="Роль"
          value={v.role}
          onChange={(role) => setV({ ...v, role })}
          options={[
            { value: "general", label: "Универсальный помощник" },
            { value: "support", label: "Поддержка клиентов" },
            { value: "sales", label: "Консультант по продажам" },
          ]}
        />
        <div className="sm:col-span-2">
          <TextAreaField label="Описание" value={v.description} onChange={(description) => setV({ ...v, description })} rows={2} error={err("description")} />
        </div>
        <SelectField
          label="Тон общения"
          value={v.tone as "friendly"}
          onChange={(tone) => setV({ ...v, tone })}
          options={["friendly", "professional", "casual", "concise", "enthusiastic"].map((t) => ({ value: t as "friendly", label: toneLabels[t] ?? t }))}
        />
        <SelectField
          label="Язык ответов"
          value={v.languageMode as "match_user"}
          onChange={(languageMode) => setV({ ...v, languageMode })}
          options={[
            { value: "match_user" as const, label: "На языке клиента" },
            { value: "fixed" as "match_user", label: "Всегда на одном языке" },
          ]}
        />
        {v.languageMode === "fixed" && (
          <SelectField label="Язык" value={v.language} onChange={(language) => setV({ ...v, language })} options={languages} error={err("language")} />
        )}
        <div className="sm:col-span-2">
          <Button onClick={() => save(v)} disabled={pending}>
            {pending ? "Сохраняем…" : "Сохранить"}
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
        <CardTitle>Инструкции</CardTitle>
        <CardDescription>Агент следует этим инструкциям и не придумывает фактов, которых нет здесь или в базе знаний.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <TextAreaField
          label="Системные инструкции"
          value={v.instructions}
          onChange={(instructions) => setV({ ...v, instructions })}
          rows={8}
          error={err("instructions")}
          placeholder="Ты — дружелюбный помощник студии Bloom. Отвечай коротко. Когда уместно, предлагай записаться на бесплатную консультацию."
        />
        <TextAreaField
          label="Информация о бизнесе"
          value={v.businessInfo}
          onChange={(businessInfo) => setV({ ...v, businessInfo })}
          rows={6}
          error={err("businessInfo")}
          hint="Краткие факты, которые агент знает всегда: что вы продаёте, адрес, часы работы, контакты. Объёмные материалы добавляйте в базу знаний."
        />
        <Button onClick={() => save(v)} disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить"}
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
          <CardTitle>Поведение</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SwitchField label="Агент включён" description="Выключенный агент не отвечает в автоматизациях." checked={v.enabled} onChange={(enabled) => setV({ ...v, enabled })} />
          <TextAreaField
            label="Запасной ответ"
            value={v.fallbackResponse}
            onChange={(fallbackResponse) => setV({ ...v, fallbackResponse })}
            rows={2}
            error={err("fallbackResponse")}
            hint="Отправляется, если ответа нет в базе знаний."
          />
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Передача диалога человеку</p>
            <SwitchField
              label="Когда клиент просит позвать человека"
              description="Например: «позовите менеджера», «хочу поговорить с человеком»."
              checked={v.escalateOnExplicitRequest}
              onChange={(escalateOnExplicitRequest) => setV({ ...v, escalateOnExplicitRequest })}
            />
            <SwitchField label="Когда агент не может ответить" checked={v.escalateOnNoAnswer} onChange={(escalateOnNoAnswer) => setV({ ...v, escalateOnNoAnswer })} />
            <TagListField
              label="Стоп-слова для передачи человеку"
              values={v.escalationKeywords}
              onChange={(escalationKeywords) => setV({ ...v, escalationKeywords })}
              hint="Сообщения с этими словами всегда передаются человеку (например: возврат, жалоба)."
            />
            <p className="text-xs text-muted-foreground">
              При передаче диалог помечается как «Нужен человек» и создаётся уведомление в приложении. Внешние оповещения не отправляются.
            </p>
          </div>
          <Button onClick={() => save(v)} disabled={pending}>
            {pending ? "Сохраняем…" : "Сохранить настройки"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Удаление агента</CardTitle>
          <CardDescription>Удаляет агента, его базу знаний и вопросы без ответа. Автоматизации, которые его используют, перестанут проходить проверку.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setConfirm(true)} disabled={deleting}>
            <Trash2 aria-hidden /> Удалить агента
          </Button>
        </CardContent>
      </Card>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить «{agent.name}»?</AlertDialogTitle>
            <AlertDialogDescription>Агент и его база знаний будут удалены навсегда. Это действие нельзя отменить.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
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
              Удалить агента
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
