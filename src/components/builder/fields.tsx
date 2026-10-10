"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Field wrapper used throughout the node config panel. */
export function FieldRow({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: React.ReactNode;
  placeholder?: string;
  type?: string;
}) {
  const id = useId();
  return (
    <FieldRow label={label} htmlFor={id} error={error} hint={hint}>
      <Input id={id} type={type} value={value} placeholder={placeholder} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)} />
    </FieldRow>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: React.ReactNode;
  placeholder?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <FieldRow label={label} htmlFor={id} error={error} hint={hint}>
      <Textarea id={id} rows={rows} value={value} placeholder={placeholder} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)} />
    </FieldRow>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  error,
  hint,
  placeholder,
}: {
  label: string;
  value: T | "";
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean }[];
  error?: string;
  hint?: React.ReactNode;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <FieldRow label={label} htmlFor={id} error={error} hint={hint}>
      <Select value={value || undefined} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger id={id} className="w-full" aria-invalid={error ? true : undefined}>
          <SelectValue placeholder={placeholder ?? "Select…"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  );
}

export function SwitchField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <span>
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Chips input: Enter or comma adds a value. */
export function TagListField({
  label,
  values,
  onChange,
  error,
  hint,
  placeholder = "Type and press Enter",
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  error?: string;
  hint?: React.ReactNode;
  placeholder?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim().replace(/,$/, "");
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setDraft("");
  };
  return (
    <FieldRow label={label} htmlFor={id} error={error} hint={hint}>
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          error && "border-destructive",
        )}
      >
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="rounded hover:text-destructive">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => (e.target.value.endsWith(",") ? (setDraft(e.target.value), add()) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={add}
          placeholder={values.length ? "" : placeholder}
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </FieldRow>
  );
}

const units = [
  { value: "1", label: "seconds" },
  { value: "60", label: "minutes" },
  { value: "3600", label: "hours" },
  { value: "86400", label: "days" },
];

/** Seconds stored, edited as value + unit. */
export function DurationField({
  label,
  seconds,
  onChange,
  error,
  hint,
  min = 0,
}: {
  label: string;
  seconds: number;
  onChange: (s: number) => void;
  error?: string;
  hint?: React.ReactNode;
  min?: number;
}) {
  const id = useId();
  const unit = [86400, 3600, 60].find((u) => seconds > 0 && seconds % u === 0) ?? 1;
  return (
    <FieldRow label={label} htmlFor={id} error={error} hint={hint}>
      <div className="flex gap-2">
        <Input
          id={id}
          type="number"
          min={min}
          value={seconds / unit}
          onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value || 0) * unit)))}
          className="w-24"
          aria-invalid={error ? true : undefined}
        />
        <Select value={String(unit)} onValueChange={(u) => onChange(Math.round((seconds / unit) * Number(u)))}>
          <SelectTrigger className="flex-1" aria-label="Unit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {units.map((u) => (
              <SelectItem key={u.value} value={u.value}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </FieldRow>
  );
}

/** Generic editable list with add/remove. */
export function ListEditor<T>({
  label,
  items,
  onChange,
  render,
  create,
  max,
  addLabel,
  error,
}: {
  label: string;
  items: T[];
  onChange: (items: T[]) => void;
  render: (item: T, update: (next: T) => void, index: number) => React.ReactNode;
  create: () => T;
  max?: number;
  addLabel: string;
  error?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{render(item, (next) => onChange(items.map((x, j) => (j === i ? next : x))), i)}</div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label={`Remove item ${i + 1}`}
          >
            <X />
          </Button>
        </div>
      ))}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {(max === undefined || items.length < max) && (
        <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => onChange([...items, create()])}>
          <Plus aria-hidden /> {addLabel}
        </Button>
      )}
    </div>
  );
}
