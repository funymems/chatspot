"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SelectField, TagListField, TextAreaField, TextField } from "@/components/builder/fields";
import { createContactAction } from "@/app/actions/crm";
import { leadStatusOptions } from "./lead-status";

export function NewContactButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty = { firstName: "", lastName: "", email: "", phone: "", leadStatus: "new" as const, notes: "", tags: [] as string[] };
  const [v, setV] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const err = (k: string) => errors[k]?.[0];

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden /> New contact
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setV(empty);
            setErrors({});
            setFormError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await createContactAction(slug, v);
                if (!res.ok) {
                  setErrors(res.fieldErrors ?? {});
                  setFormError(res.fieldErrors ? null : res.error);
                  return;
                }
                toast.success(res.message);
                setOpen(false);
                router.push(`/w/${slug}/contacts/${res.data.id}`);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>New contact</DialogTitle>
              <DialogDescription>Add someone manually. Contacts from conversations are created automatically.</DialogDescription>
            </DialogHeader>
            {formError && <p className="rounded-lg bg-destructive/5 p-2.5 text-sm text-destructive">{formError}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="First name" value={v.firstName} onChange={(firstName) => setV({ ...v, firstName })} error={err("firstName")} />
              <TextField label="Last name" value={v.lastName} onChange={(lastName) => setV({ ...v, lastName })} error={err("lastName")} />
              <TextField label="Email" type="email" value={v.email} onChange={(email) => setV({ ...v, email })} error={err("email")} />
              <TextField label="Phone" value={v.phone} onChange={(phone) => setV({ ...v, phone })} error={err("phone")} placeholder="+7 701 123 4567" />
            </div>
            <SelectField label="Lead status" value={v.leadStatus} onChange={(leadStatus) => setV({ ...v, leadStatus: leadStatus as "new" })} options={leadStatusOptions} />
            <TagListField label="Tags" values={v.tags} onChange={(tags) => setV({ ...v, tags })} />
            <TextAreaField label="Notes" value={v.notes} onChange={(notes) => setV({ ...v, notes })} rows={2} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Create contact"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
