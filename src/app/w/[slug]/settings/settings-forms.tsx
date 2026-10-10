"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, fieldA11y } from "@/components/forms/field";
import { renameWorkspaceAction, updateProfileAction } from "@/app/actions/workspaces";
import type { ActionResult } from "@/lib/action-result";

function useSingleFieldForm(initial: string, save: (value: string) => Promise<ActionResult<null>>, field: string) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await save(value);
      if (res.ok) {
        setError(undefined);
        toast.success(res.message ?? "Сохранено");
      } else {
        setError(res.fieldErrors?.[field]?.[0] ?? res.error);
      }
    });
  };
  return { value, setValue, error, pending, submit, dirty: value.trim() !== initial };
}

export function WorkspaceForm({ slug, name, canEdit }: { slug: string; name: string; canEdit: boolean }) {
  const f = useSingleFieldForm(name, (v) => renameWorkspaceAction(slug, { name: v }), "name");
  return (
    <form onSubmit={f.submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field
        id="ws-name"
        label="Название рабочего пространства"
        error={f.error}
        hint={canEdit ? undefined : "Переименовать пространство могут только владельцы и администраторы."}
        className="flex-1"
      >
        <Input
          {...fieldA11y("ws-name", f.error)}
          value={f.value}
          onChange={(e) => f.setValue(e.target.value)}
          disabled={!canEdit}
        />
      </Field>
      {canEdit && (
        <Button type="submit" disabled={!f.dirty || f.pending}>
          {f.pending ? "Сохраняем…" : "Сохранить"}
        </Button>
      )}
    </form>
  );
}

export function ProfileForm({ fullName }: { fullName: string }) {
  const f = useSingleFieldForm(fullName, (v) => updateProfileAction({ fullName: v }), "fullName");
  return (
    <form onSubmit={f.submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field id="profile-name" label="Имя и фамилия" error={f.error} className="flex-1">
        <Input {...fieldA11y("profile-name", f.error)} value={f.value} onChange={(e) => f.setValue(e.target.value)} />
      </Field>
      <Button type="submit" disabled={!f.dirty || f.pending}>
        {f.pending ? "Сохраняем…" : "Сохранить"}
      </Button>
    </form>
  );
}
