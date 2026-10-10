"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Field, fieldA11y } from "@/components/forms/field";
import { createWorkspaceAction } from "@/app/actions/workspaces";
import { cn } from "@/lib/utils";

export type ShellWorkspace = { id: string; name: string; slug: string; role: string; isDemo: boolean };

function Initial({ name }: { name: string }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
      {name.trim().charAt(0).toUpperCase() || "W"}
    </span>
  );
}

export function WorkspaceSwitcher({
  current,
  workspaces,
  collapsed,
}: {
  current: ShellWorkspace;
  workspaces: ShellWorkspace[];
  collapsed: boolean;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex w-full items-center gap-2 rounded-lg p-1.5 text-left text-sm outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              collapsed && "justify-center",
            )}
            aria-label={`Current workspace: ${current.name}. Switch workspace`}
          >
            <Initial name={current.name} />
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-sidebar-accent-foreground">{current.name}</span>
                  <span className="block text-xs capitalize text-sidebar-foreground/60">{current.role}</span>
                </span>
                <ChevronsUpDown className="size-4 text-sidebar-foreground/50" aria-hidden />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
          {workspaces.map((ws) => (
            <DropdownMenuItem key={ws.id} onSelect={() => router.push(`/w/${ws.slug}/dashboard`)}>
              <span className="truncate">{ws.name}</span>
              {ws.isDemo && <span className="ml-1 text-xs text-muted-foreground">(demo)</span>}
              {ws.id === current.id && <Check className="ml-auto" aria-label="Current" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialogOpen(true)}>
            <Plus aria-hidden /> Create workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

export function CreateWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await createWorkspaceAction({ name });
      if (!res.ok) {
        setError(res.fieldErrors?.name?.[0] ?? res.error);
        return;
      }
      toast.success(res.message);
      onOpenChange(false);
      setName("");
      setError(undefined);
      router.push(`/w/${res.data.slug}/dashboard`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              Workspaces keep automations, contacts and agents fully separate — e.g. one per brand or client.
            </DialogDescription>
          </DialogHeader>
          <Field id="workspace-name" label="Workspace name" error={error}>
            <Input
              {...fieldA11y("workspace-name", error)}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Studio"
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
