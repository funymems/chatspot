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
        <MessageSquarePlus aria-hidden /> Симулировать клиента
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
              <DialogTitle>Симуляция клиента</DialogTitle>
              <DialogDescription>Создаёт контакт в демо-канале и отправляет его первое сообщение через ваши активные автоматизации — так же, как это сделал бы настоящий канал.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Имя" value={v.firstName} onChange={(firstName) => setV({ ...v, firstName })} error={errors.firstName?.[0]} />
              <TextField label="Фамилия" value={v.lastName} onChange={(lastName) => setV({ ...v, lastName })} />
            </div>
            <TextAreaField label="Первое сообщение" value={v.text} onChange={(text) => setV({ ...v, text })} rows={2} error={errors.text?.[0]} placeholder="Например: КУРС" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Отправляем…" : "Начать диалог"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
