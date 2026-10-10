"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, MessageCircleQuestion, Pencil, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { TextAreaField, TextField } from "@/components/builder/fields";
import {
  addKnowledgeAction,
  deleteKnowledgeAction,
  testRetrievalAction,
  updateKnowledgeAction,
  uploadKnowledgeFileAction,
} from "@/app/actions/agents";
import type { SourceView } from "./types";

type Editing = { kind: "text" | "qa"; source?: SourceView } | null;

export function KnowledgeTab({ slug, agentId, sources }: { slug: string; agentId: string; sources: SourceView[] }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [uploading, startUpload] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const term = q.trim().toLowerCase();
  const visible = term
    ? sources.filter((s) => [s.title, s.content, s.question ?? "", s.answer ?? ""].some((x) => x.toLowerCase().includes(term)))
    : sources;

  const remove = async (s: SourceView) => {
    if (!window.confirm(`Удалить «${s.title}» из базы знаний?`)) return;
    setBusyId(s.id);
    const res = await deleteKnowledgeAction(slug, s.id);
    setBusyId(null);
    if (res.ok) toast.success(res.message);
    else toast.error(res.error);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>База знаний</CardTitle>
          <CardDescription>
            The agent searches these sources for every question and answers only from what it finds. {sources.length} source
            {sources.length === 1 ? "" : "s"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по источникам" aria-label="Поиск по источникам" className="pl-8" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing({ kind: "qa" })}>
                <MessageCircleQuestion aria-hidden /> Добавить вопрос-ответ
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing({ kind: "text" })}>
                <FileText aria-hidden /> Добавить документ
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload aria-hidden /> {uploading ? "Загружаем…" : "Загрузить файл"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  const fd = new FormData();
                  fd.set("file", file);
                  startUpload(async () => {
                    const res = await uploadKnowledgeFileAction(slug, agentId, fd);
                    if (res.ok) toast.success(res.message);
                    else toast.error(res.error);
                  });
                }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Можно загружать .txt, .md и .csv до 1 МБ. PDF и Word пока не поддерживаются.</p>

          {sources.length === 0 ? (
            <EmptyState
              compact
              icon={FileText}
              title="База знаний пуста"
              description="Добавьте частые вопросы в формате «вопрос — ответ» или вставьте документы: прайс-лист, правила, описания товаров."
            />
          ) : visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">По запросу «{q}» ничего не найдено.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {visible.map((s) => (
                <li key={s.id} className="flex items-start gap-3 p-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    {s.type === "qa" ? <MessageCircleQuestion className="size-4" aria-hidden /> : <FileText className="size-4" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{s.type === "qa" ? s.answer : s.content}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {s.type === "qa" ? "Вопрос-ответ" : s.type === "file" ? `Файл · ${s.fileName}` : "Документ"} · обновлено <RelativeTime date={s.updatedAt} />
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={`Изменить: ${s.title}`} onClick={() => setEditing({ kind: s.type === "qa" ? "qa" : "text", source: s })}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Удалить: ${s.title}`}
                    className="hover:text-destructive"
                    disabled={busyId === s.id}
                    onClick={() => remove(s)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <RetrievalCheck slug={slug} agentId={agentId} disabled={sources.length === 0} />
      {editing && <SourceDialog slug={slug} agentId={agentId} editing={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SourceDialog({ slug, agentId, editing, onClose }: { slug: string; agentId: string; editing: NonNullable<Editing>; onClose: () => void }) {
  const s = editing.source;
  const [v, setV] = useState({
    title: s?.title ?? "",
    content: s?.content ?? "",
    question: s?.question ?? "",
    answer: s?.answer ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, start] = useTransition();
  const isQa = editing.kind === "qa";
  const payload = isQa ? { question: v.question, answer: v.answer } : { title: v.title, content: v.content };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = s ? await updateKnowledgeAction(slug, s.id, payload) : await addKnowledgeAction(slug, agentId, editing.kind, payload);
              if (!res.ok) {
                setErrors(res.fieldErrors ?? {});
                if (!res.fieldErrors) toast.error(res.error);
                return;
              }
              toast.success(res.message);
              onClose();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{s ? "Изменить источник" : isQa ? "Новый вопрос-ответ" : "Новый документ"}</DialogTitle>
            <DialogDescription>
              {isQa ? "Вопрос, который задают клиенты, и точный ответ, который должен дать агент." : "Вставьте текст: правила, прайс-лист или описание товаров."}
            </DialogDescription>
          </DialogHeader>
          {isQa ? (
            <>
              <TextField label="Вопрос" value={v.question} onChange={(question) => setV({ ...v, question })} error={errors.question?.[0]} placeholder="Вы доставляете в другие города?" />
              <TextAreaField label="Ответ" value={v.answer} onChange={(answer) => setV({ ...v, answer })} rows={4} error={errors.answer?.[0]} />
            </>
          ) : (
            <>
              <TextField label="Заголовок" value={v.title} onChange={(title) => setV({ ...v, title })} error={errors.title?.[0]} placeholder="Доставка и возврат" />
              <TextAreaField label="Текст" value={v.content} onChange={(content) => setV({ ...v, content })} rows={10} error={errors.content?.[0]} />
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Сохраняем…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RetrievalCheck({ slug, agentId, disabled }: { slug: string; agentId: string; disabled: boolean }) {
  const [question, setQuestion] = useState("");
  const [hits, setHits] = useState<{ title: string; content: string; rank: number }[] | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Проверка поиска</CardTitle>
        <CardDescription>Проверьте, что агент найдёт в базе знаний по вопросу — ИИ при этом не вызывается.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await testRetrievalAction(slug, agentId, question);
              if (res.ok) setHits(res.data);
              else toast.error(res.error);
            });
          }}
        >
          <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Например: сколько идёт доставка?" aria-label="Тестовый вопрос" disabled={disabled} />
          <Button type="submit" disabled={disabled || pending || !question.trim()}>
            {pending ? "Ищем…" : "Найти"}
          </Button>
        </form>
        {hits &&
          (hits.length === 0 ? (
            <p className="rounded-lg bg-warning/10 p-3 text-sm text-amber-800">
              Ничего подходящего не найдено — агент отправит запасной ответ и запишет вопрос в «Без ответа».
            </p>
          ) : (
            <ol className="space-y-2">
              {hits.map((h, i) => (
                <li key={i} className="rounded-lg border p-3 text-sm">
                  <p className="flex items-center justify-between font-medium">
                    {h.title} <span className="text-xs font-normal text-muted-foreground">релевантность {h.rank.toFixed(2)}</span>
                  </p>
                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{h.content}</p>
                </li>
              ))}
            </ol>
          ))}
      </CardContent>
    </Card>
  );
}
