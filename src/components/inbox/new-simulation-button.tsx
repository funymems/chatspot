"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TextAreaField, TextField } from "@/components/builder/fields";
import { startSimulationAction } from "@/app/actions/crm";

/** Starts a conversation from a new simulated contact on the demo channel. */
export function NewSimulationButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ firstName: "", lastName: "", text: "" });
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, start] = useTransition();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <MessageSquarePlus aria-hidden /> Simulate a customer
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await startSimulationAction(slug, v);
                if (!res.ok) {
                  setErrors(res.fieldErrors ?? {});
                  if (!res.fieldErrors) toast.error(res.error);
                  return;
                }
                toast.success(res.data.info);
                setOpen(false);
                setV({ firstName: "", lastName: "", text: "" });
                router.push(`/w/${slug}/conversations?status=all&c=${res.data.conversationId}`);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Simulate a customer</DialogTitle>
              <DialogDescription>Creates a demo-channel contact and sends their first message through your active automations, exactly like a real channel would.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="First name" value={v.firstName} onChange={(firstName) => setV({ ...v, firstName })} error={errors.firstName?.[0]} />
              <TextField label="Last name" value={v.lastName} onChange={(lastName) => setV({ ...v, lastName })} />
            </div>
            <TextAreaField label="First message" value={v.text} onChange={(text) => setV({ ...v, text })} rows={2} error={errors.text?.[0]} placeholder="e.g. COURSE" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Sending…" : "Start conversation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
