"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { SelectField, TextAreaField, TextField } from "@/components/builder/fields";
import { contactTagAction, deleteContactAction, mergeContactsAction, setCustomFieldsAction, updateContactAction } from "@/app/actions/crm";
import { leadStatusOptions } from "./lead-status";

type ContactForm = { id: string; firstName: string; lastName: string; email: string; phone: string; leadStatus: string; notes: string };

export function ContactEditor({ slug, contact }: { slug: string; contact: ContactForm }) {
  const router = useRouter();
  const [v, setV] = useState(contact);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const err = (k: string) => errors[k]?.[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Данные контакта</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Имя" value={v.firstName} onChange={(firstName) => setV({ ...v, firstName })} error={err("firstName")} />
          <TextField label="Фамилия" value={v.lastName} onChange={(lastName) => setV({ ...v, lastName })} error={err("lastName")} />
          <TextField label="Эл. почта" type="email" value={v.email} onChange={(email) => setV({ ...v, email })} error={err("email")} />
          <TextField label="Телефон" value={v.phone} onChange={(phone) => setV({ ...v, phone })} error={err("phone")} />
          <SelectField label="Статус лида" value={v.leadStatus} onChange={(leadStatus) => setV({ ...v, leadStatus })} options={leadStatusOptions} />
        </div>
        <TextAreaField label="Заметки" value={v.notes} onChange={(notes) => setV({ ...v, notes })} rows={3} error={err("notes")} />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await updateContactAction(slug, contact.id, v);
                if (res.ok) {
                  setErrors({});
                  toast.success(res.message);
                } else {
                  setErrors(res.fieldErrors ?? {});
                  if (!res.fieldErrors) toast.error(res.error);
                }
              })
            }
          >
            {pending ? "Сохраняем…" : "Сохранить"}
          </Button>
          <Button variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden /> Удалить контакт
          </Button>
        </div>
      </CardContent>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить этот контакт?</AlertDialogTitle>
            <AlertDialogDescription>Его диалоги и сообщения тоже будут удалены. Это действие нельзя отменить.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() =>
                start(async () => {
                  const res = await deleteContactAction(slug, contact.id);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(res.message);
                  router.push(`/w/${slug}/contacts`);
                })
              }
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function TagsEditor({ slug, contactId, tags }: { slug: string; contactId: string; tags: string[] }) {
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const run = (tag: string, add: boolean) =>
    start(async () => {
      const res = await contactTagAction(slug, contactId, tag, add);
      if (!res.ok) toast.error(res.error);
      else if (add) setDraft("");
    });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Теги</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {tags.length === 0 && <span className="text-sm text-muted-foreground">Тегов нет</span>}
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs text-accent-foreground">
              {t}
              <button type="button" disabled={pending} onClick={() => run(t, false)} aria-label={`Удалить тег ${t}`} className="hover:text-destructive">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) run(draft.trim(), true);
          }}
        >
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Добавить тег" aria-label="Новый тег" maxLength={50} />
          <Button type="submit" variant="outline" size="icon" disabled={pending || !draft.trim()} aria-label="Добавить тег">
            <Plus />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function CustomFieldsEditor({ slug, contactId, fields }: { slug: string; contactId: string; fields: Record<string, string> }) {
  const [rows, setRows] = useState(Object.entries(fields).map(([key, value]) => ({ key, value })));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Дополнительные поля</CardTitle>
        <CardDescription>Заполняются автоматизациями (например, course_interest) или вручную. В сценариях используйте их как {"{{contact.field}}"}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <Input value={r.key} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} placeholder="field_name" aria-label="Название поля" className="font-mono text-xs" />
            <Input value={r.value} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="значение" aria-label="Значение поля" />
            <Button variant="ghost" size="icon" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Удалить поле">
              <X />
            </Button>
          </div>
        ))}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setRows([...rows, { key: "", value: "" }])}>
            <Plus aria-hidden /> Добавить поле
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await setCustomFieldsAction(slug, contactId, rows.filter((r) => r.key.trim()));
                if (res.ok) {
                  setError(null);
                  toast.success(res.message);
                } else setError(res.fieldErrors ? "В названиях полей — только латинские буквы, цифры и подчёркивания" : res.error);
              })
            }
          >
            Сохранить поля
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function DuplicatesCard({ slug, primary, duplicates }: { slug: string; primary: { id: string; name: string }; duplicates: { id: string; name: string; detail: string }[] }) {
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [pending, start] = useTransition();
  if (duplicates.length === 0) return null;
  return (
    <Card className="border-warning/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Copy className="size-4" aria-hidden /> Возможные дубликаты
        </CardTitle>
        <CardDescription>Совпадает почта, телефон или имя. Ничего не объединяется без вашего решения.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {duplicates.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">
                <a href={`/w/${slug}/contacts/${d.id}`} className="block truncate font-medium hover:text-primary">
                  {d.name}
                </a>
                <span className="block truncate text-xs text-muted-foreground">{d.detail}</span>
              </span>
              <Button size="sm" variant="outline" onClick={() => setTarget(d)}>
                Объединить
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
      <AlertDialog open={Boolean(target)} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Объединить «{target?.name}» с «{primary.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Диалоги, запуски автоматизаций и теги перейдут к контакту {primary.name}. Пустые поля заполнятся из дубликата, после чего он будет скрыт. Это
              действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await mergeContactsAction(slug, primary.id, target!.id);
                  if (res.ok) toast.success(res.message);
                  else toast.error(res.error);
                  setTarget(null);
                })
              }
            >
              Объединить контакты
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
