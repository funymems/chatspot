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
import { defaultAction, defaultRule } from "@/lib/domain/graph/defaults";
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
          <Button variant="ghost" size="icon-sm" onClick={props.onDuplicate} aria-label="Копировать блок" title="Копировать (Ctrl+D)">
            <Copy />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={props.onDelete} aria-label="Удалить блок" title="Удалить (Del)" className="hover:text-destructive">
          <Trash2 />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={props.onClose} aria-label="Закрыть панель">
          <X />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <TextField label="Отображаемое название (необязательно)" value={node.label ?? ""} onChange={props.onLabel} placeholder={meta.label} />
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
        label="Запускается, когда"
        value={d.kind}
        onChange={(kind) => set({ kind }, "kind")}
        options={[
          { value: "keyword", label: "В сообщении есть ключевое слово" },
          { value: "phrase", label: "Сообщение совпадает с фразой" },
          { value: "incoming_message", label: "Приходит любое сообщение" },
          { value: "manual", label: "Запуск вручную (тест)" },
          { value: "webhook", label: "Вебхук / тестовое событие" },
        ]}
      />
      {d.kind === "keyword" && (
        <TagListField
          label="Ключевые слова"
          values={d.keywords ?? []}
          onChange={(keywords) => set({ keywords }, "keywords")}
          error={err("keywords") ?? issues.find((i) => i.nodeId === node.id && i.code === "trigger_keywords")?.message}
          hint="Совпадает по целому слову: например, КУРС сработает на «пришлите курс»."
        />
      )}
      {d.kind === "phrase" && (
        <>
          <SelectField
            label="Тип совпадения"
            value={d.phraseMatch}
            onChange={(phraseMatch) => set({ phraseMatch }, "phraseMatch")}
            options={[
              { value: "contains", label: "Сообщение содержит фразу" },
              { value: "exact", label: "Сообщение в точности равно фразе" },
              { value: "starts_with", label: "Сообщение начинается с фразы" },
            ]}
          />
          <TagListField
            label="Фразы"
            values={d.phrases ?? []}
            onChange={(phrases) => set({ phrases }, "phrases")}
            error={err("phrases") ?? issues.find((i) => i.nodeId === node.id && i.code === "trigger_phrases")?.message}
          />
        </>
      )}
      {(d.kind === "keyword" || d.kind === "phrase") && (
        <SwitchField label="Учитывать регистр" checked={d.caseSensitive} onChange={(caseSensitive) => set({ caseSensitive }, "caseSensitive")} />
      )}
      {d.kind === "webhook" && (
        <TextField
          label="Название события"
          value={d.eventName}
          onChange={(eventName) => set({ eventName }, "eventName")}
          placeholder="inquiry_received"
          error={err("eventName") ?? issues.find((i) => i.nodeId === node.id && i.code === "trigger_event")?.message}
          hint="Универсальное событие для будущих интеграций. Пока его можно вызвать только из тестового запуска."
        />
      )}
      <TextAreaField
        label="Пример сообщения для проверки"
        value={d.sampleInput}
        onChange={(sampleInput) => set({ sampleInput }, "sampleInput")}
        rows={2}
        placeholder="Например: Здравствуйте, хочу КУРС"
        hint={<TriggerMatchPreview config={d} />}
      />
    </div>
  );
}

/** Live check of whether the sample input would start this flow (mirrors the engine's matcher). */
function TriggerMatchPreview({ config }: { config: TriggerConfig }) {
  if (config.kind === "manual" || config.kind === "webhook") return <>Используется как входящее сообщение при тестовых запусках.</>;
  if (!config.sampleInput) return <>Введите пример сообщения, чтобы проверить, запустит ли оно сценарий.</>;
  const matches = matchesTrigger(config, config.sampleInput);
  return (
    <span className={matches ? "text-success" : "text-amber-700"}>
      {matches ? "✓ Это сообщение запустит сценарий" : "✗ Это сообщение не запустит сценарий"}
    </span>
  );
}

// ─── Message ────────────────────────────────────────────────────────────────

function VariableChips({ variables, onInsert }: { variables: string[]; onInsert: (token: string) => void }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span>Вставить:</span>
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
        label="Сообщения (отправляются по порядку)"
        items={d.messages ?? []}
        max={10}
        addLabel="Добавить сообщение"
        error={err("messages") && !d.messages?.length ? err("messages") : undefined}
        create={() => ({ id: newId("m"), text: "" })}
        onChange={(messages) => set({ messages }, "messages")}
        render={(m, update, i) => (
          <div className="space-y-1">
            <textarea
              value={m.text}
              rows={3}
              onChange={(e) => update({ ...m, text: e.target.value })}
              aria-label={`Сообщение ${i + 1}`}
              aria-invalid={err(`messages.${i}.text`) || issues.some((x) => x.nodeId === node.id && x.path === `messages.${i}.text`) ? true : undefined}
              placeholder="Привет, {{contact.first_name}}!"
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
            />
            {issues.find((x) => x.nodeId === node.id && x.path === `messages.${i}.text`) && (
              <p className="text-xs text-destructive">Сообщение пустое</p>
            )}
            <div className="text-xs text-muted-foreground">
              <VariableChips variables={variables} onInsert={(token) => update({ ...m, text: `${m.text}${m.text && !m.text.endsWith(" ") ? " " : ""}${token}` })} />
            </div>
          </div>
        )}
      />

      <ListEditor
        label="Кнопки быстрого ответа"
        items={d.quickReplies ?? []}
        max={10}
        addLabel="Добавить быстрый ответ"
        create={() => ({ id: newId("q"), label: "" })}
        onChange={(quickReplies) => set({ quickReplies }, "quickReplies")}
        render={(q, update, i) => (
          <Input value={q.label} maxLength={40} onChange={(e) => update({ ...q, label: e.target.value })} placeholder="Текст кнопки" aria-label={`Быстрый ответ ${i + 1}`} aria-invalid={err(`quickReplies.${i}`) ? true : undefined} />
        )}
      />

      <ListEditor
        label="Кнопки-ссылки"
        items={d.linkButtons ?? []}
        max={3}
        addLabel="Добавить кнопку-ссылку"
        create={() => ({ id: newId("b"), label: "", url: "https://" })}
        onChange={(linkButtons) => set({ linkButtons }, "linkButtons")}
        render={(b, update, i) => (
          <div className="grid gap-1.5">
            <Input value={b.label} maxLength={40} onChange={(e) => update({ ...b, label: e.target.value })} placeholder="Текст" aria-label={`Текст ссылки ${i + 1}`} />
            <Input value={b.url} onChange={(e) => update({ ...b, url: e.target.value })} placeholder="https://…" aria-label={`Адрес ссылки ${i + 1}`} aria-invalid={err(`linkButtons.${i}.url`) ? true : undefined} />
            {err(`linkButtons.${i}`) && <p className="text-xs text-destructive">{err(`linkButtons.${i}`)}</p>}
          </div>
        )}
      />

      <DurationField
        label="Задержка перед отправкой"
        seconds={d.delaySeconds ?? 0}
        onChange={(delaySeconds) => set({ delaySeconds }, "delaySeconds")}
        hint="Задержка выполняется фоновой задачей."
      />

      <SwitchField
        label="Ждать ответа"
        description="Приостановить сценарий, пока контакт не ответит."
        checked={d.waitForReply ?? false}
        onChange={(waitForReply) => set({ waitForReply }, "waitForReply")}
      />
      {d.waitForReply && (
        <>
          <TextField
            label="Сохранить ответ в переменную"
            value={d.saveReplyAs ?? ""}
            onChange={(saveReplyAs) => set({ saveReplyAs }, "saveReplyAs")}
            placeholder="course_choice"
            error={err("saveReplyAs")}
            hint={d.saveReplyAs ? <>Используйте её дальше как <code>{`{{${d.saveReplyAs}}}`}</code></> : "Необязательно. Латинские буквы, цифры и подчёркивания."}
          />
          <DurationField
            label="Перестать ждать через (0 — ждать бесконечно)"
            seconds={d.replyTimeoutSeconds ?? 0}
            onChange={(replyTimeoutSeconds) => set({ replyTimeoutSeconds }, "replyTimeoutSeconds")}
          />
        </>
      )}
    </div>
  );
}

// ─── Condition ──────────────────────────────────────────────────────────────

const operatorLabels: Record<(typeof compareOperators)[number], string> = {
  equals: "равно",
  not_equals: "не равно",
  contains: "содержит",
  is_empty: "пусто",
  is_not_empty: "не пусто",
};
const operatorOptions = compareOperators.map((o) => ({ value: o, label: operatorLabels[o] }));

function ConditionForm({ node, issues, onChange }: Props) {
  const d = node.data as ConditionConfig;
  const err = useErrors(issues, node.id);
  const set = (patch: Partial<ConditionConfig>, field: string) => onChange({ ...d, ...patch }, field);
  return (
    <div className="space-y-4">
      <SelectField
        label="Совпадение"
        value={d.combinator ?? "all"}
        onChange={(combinator) => set({ combinator }, "combinator")}
        options={[
          { value: "all", label: "Все правила (И)" },
          { value: "any", label: "Любое правило (ИЛИ)" },
        ]}
      />
      <ListEditor<ConditionRule>
        label="Правила"
        items={d.rules ?? []}
        max={10}
        addLabel="Добавить правило"
        error={!d.rules?.length ? err("rules") : undefined}
        create={() => defaultRule("message_contains")}
        onChange={(rules) => set({ rules }, "rules")}
        render={(rule, update, i) => <RuleEditor rule={rule} onChange={update} error={(p) => err(`rules.${i}.${p}`)} />}
      />
      <p className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
        Подключите выход <span className="font-medium text-success">Да</span> для случая, когда правила выполняются, и выход{" "}
        <span className="font-medium text-destructive">Нет</span> для всех остальных случаев.
      </p>
    </div>
  );
}

function RuleEditor({ rule, onChange, error }: { rule: ConditionRule; onChange: (r: ConditionRule) => void; error: (path: string) => string | undefined }) {
  return (
    <div className="space-y-2 rounded-lg border p-2.5">
      <SelectField
        label="Правило"
        value={rule.kind}
        onChange={(kind) => onChange(defaultRule(kind))}
        options={[
          { value: "message_contains", label: "В сообщении есть ключевое слово" },
          { value: "variable", label: "Переменная сравнивается со значением" },
          { value: "has_tag", label: "У контакта есть тег" },
          { value: "contact_field", label: "Поле контакта сравнивается со значением" },
        ]}
      />
      {rule.kind === "message_contains" && (
        <TagListField label="Ключевые слова" values={rule.keywords} onChange={(keywords) => onChange({ ...rule, keywords })} error={error("keywords")} />
      )}
      {rule.kind === "has_tag" && <TextField label="Тег" value={rule.tag} onChange={(tag) => onChange({ ...rule, tag })} error={error("tag")} placeholder="vip" />}
      {(rule.kind === "variable" || rule.kind === "contact_field") && (
        <>
          {rule.kind === "variable" ? (
            <TextField label="Переменная" value={rule.variable} onChange={(variable) => onChange({ ...rule, variable })} error={error("variable")} placeholder="course_choice" />
          ) : (
            <TextField label="Поле контакта" value={rule.field} onChange={(field) => onChange({ ...rule, field })} error={error("field")} placeholder="email, first_name или своё поле" />
          )}
          <SelectField label="Оператор" value={rule.operator} onChange={(operator) => onChange({ ...rule, operator })} options={operatorOptions} />
          {rule.operator !== "is_empty" && rule.operator !== "is_not_empty" && (
            <TextField label="Значение" value={rule.value} onChange={(value) => onChange({ ...rule, value })} error={error("value")} />
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
        label="Действие"
        value={a.kind}
        onChange={(kind) => set(defaultAction(kind), "kind")}
        options={[
          { value: "add_tag", label: "Добавить тег контакту" },
          { value: "remove_tag", label: "Убрать тег у контакта" },
          { value: "set_field", label: "Заполнить поле контакта" },
          { value: "capture", label: "Сохранить эл. почту или телефон" },
          { value: "wait", label: "Подождать" },
          { value: "redirect", label: "Перейти в другой сценарий" },
          { value: "log_event", label: "Записать событие" },
          { value: "mark_qualified", label: "Отметить лид как квалифицированный" },
        ]}
      />
      {(a.kind === "add_tag" || a.kind === "remove_tag") && (
        <TextField label="Тег" value={a.tag} onChange={(tag) => set({ ...a, tag }, "tag")} error={err("action.tag")} placeholder="interested" />
      )}
      {a.kind === "set_field" && (
        <>
          <TextField
            label="Поле"
            value={a.field}
            onChange={(field) => set({ ...a, field }, "field")}
            error={err("action.field")}
            placeholder="course_interest"
            hint="Встроенные: first_name, last_name, email, phone, notes. Любое другое название станет дополнительным полем."
          />
          <TextField label="Значение" value={a.value} onChange={(value) => set({ ...a, value }, "value")} error={err("action.value")} hint="Можно использовать переменные, например {{course_choice}}." />
        </>
      )}
      {a.kind === "capture" && (
        <>
          <SelectField
            label="Что сохранить"
            value={a.target}
            onChange={(target) => set({ ...a, target }, "target")}
            options={[
              { value: "email", label: "Адрес эл. почты" },
              { value: "phone", label: "Номер телефона" },
            ]}
          />
          <SelectField
            label="Откуда взять"
            value={a.source}
            onChange={(source) => set({ ...a, source }, "source")}
            options={[
              { value: "last_message", label: "Из последнего входящего сообщения" },
              { value: "variable", label: "Из сохранённой переменной" },
            ]}
          />
          {a.source === "variable" && (
            <TextField label="Переменная" value={a.variable} onChange={(variable) => set({ ...a, variable }, "variable")} error={issue("capture_variable")} placeholder="email_reply" />
          )}
          <p className="text-xs text-muted-foreground">Если найдено корректное значение, оно сохраняется в контакте; проверить его можно блоком «Условие».</p>
        </>
      )}
      {a.kind === "wait" && (
        <DurationField label="Сколько ждать" seconds={a.seconds} min={1} onChange={(seconds) => set({ ...a, seconds }, "seconds")} error={err("action.seconds")} hint="Сценарий продолжится фоновой задачей." />
      )}
      {a.kind === "redirect" && (
        <SelectField
          label="Продолжить в автоматизации"
          value={a.automationId}
          onChange={(automationId) => set({ ...a, automationId }, "automationId")}
          options={automations.map((x) => ({ value: x.id, label: x.name }))}
          placeholder={automations.length ? "Выберите автоматизацию" : "Других автоматизаций пока нет"}
          error={err("action.automationId") ?? issue("redirect_missing") ?? issue("redirect_self")}
        />
      )}
      {a.kind === "log_event" && (
        <>
          <TextField label="Название события" value={a.eventName} onChange={(eventName) => set({ ...a, eventName }, "eventName")} error={err("action.eventName")} placeholder="booking_requested" />
          <TextAreaField label="Заметка" value={a.note} onChange={(note) => set({ ...a, note }, "note")} rows={2} />
        </>
      )}
      {a.kind === "mark_qualified" && <p className="text-sm text-muted-foreground">Устанавливает контакту статус лида «Квалифицирован».</p>}
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
        label="ИИ-агент"
        value={d.agentId}
        onChange={(agentId) => set({ agentId }, "agentId")}
        options={agents.map((a) => ({ value: a.id, label: a.name }))}
        placeholder={agents.length ? "Выберите агента" : "Агентов пока нет"}
        error={err("agentId") ?? issues.find((i) => i.nodeId === node.id && i.code === "agent_missing")?.message}
        hint={agents.length ? undefined : "Сначала создайте агента в разделе «ИИ-агенты»."}
      />
      <TextAreaField label="Инструкции для этого блока" value={d.instructions} onChange={(instructions) => set({ instructions }, "instructions")} rows={3} placeholder="Отвечай коротко и предлагай курс для начинающих." />
      <TextAreaField label="Дополнительный контекст" value={d.knowledgeContext} onChange={(knowledgeContext) => set({ knowledgeContext }, "knowledgeContext")} rows={2} hint="Добавляется к тому, что агент находит в своей базе знаний." />
      <SelectField
        label="Если агент не знает ответа"
        value={d.fallback}
        onChange={(fallback) => set({ fallback }, "fallback")}
        options={[
          { value: "agent_default", label: "Отправить запасной ответ агента" },
          { value: "custom_message", label: "Отправить своё сообщение" },
          { value: "handoff", label: "Передать человеку" },
        ]}
      />
      {d.fallback === "custom_message" && (
        <TextAreaField label="Запасное сообщение" value={d.fallbackMessage} onChange={(fallbackMessage) => set({ fallbackMessage }, "fallbackMessage")} rows={2} error={err("fallbackMessage")} />
      )}
      <TextField label="Сохранить ответ в переменную (необязательно)" value={d.saveReplyAs} onChange={(saveReplyAs) => set({ saveReplyAs }, "saveReplyAs")} error={err("saveReplyAs")} placeholder="ai_answer" />
    </div>
  );
}

// ─── Note & End ─────────────────────────────────────────────────────────────

function NoteForm({ node, onChange }: Props) {
  const d = node.data as NoteConfig;
  return (
    <div className="space-y-4">
      <TextAreaField label="Заметка" value={d.text} onChange={(text) => onChange({ ...d, text }, "text")} rows={6} hint="Заметки — это комментарии для команды, они не выполняются." />
      <FieldRow label="Цвет">
        <div className="flex gap-2">
          {(["yellow", "blue", "green", "pink", "gray"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ ...d, color: c }, "color")}
              aria-label={{ yellow: "Жёлтый", blue: "Голубой", green: "Зелёный", pink: "Розовый", gray: "Серый" }[c]}
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
        label="Результат"
        value={d.outcome}
        onChange={(outcome) => onChange({ ...d, outcome }, "outcome")}
        options={[
          { value: "completed", label: "Завершено" },
          { value: "goal_reached", label: "Цель достигнута (считается конверсией)" },
          { value: "handoff", label: "Передать человеку" },
        ]}
      />
      <TextField label="Подпись результата" value={d.label} onChange={(label) => onChange({ ...d, label }, "label")} placeholder="Лид получен" />
    </div>
  );
}
