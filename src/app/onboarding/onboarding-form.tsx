"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, fieldA11y } from "@/components/forms/field";
import { createWorkspaceAction } from "@/app/actions/workspaces";

export function OnboardingForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await createWorkspaceAction({ name });
          if (!res.ok) return setError(res.fieldErrors?.name?.[0] ?? res.error);
          router.push(`/w/${res.data.slug}/dashboard`);
        });
      }}
    >
      <Field id="name" label="Workspace name" error={error}>
        <Input {...fieldA11y("name", error)} value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
      </Field>
      <Button type="submit" className="h-9 w-full" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
