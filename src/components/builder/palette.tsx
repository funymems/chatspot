"use client";

import { nodeMeta } from "@/components/flow/node-meta";
import type { NodeType } from "@/lib/domain/graph/schema";
import { cn } from "@/lib/utils";

export const DRAG_MIME = "application/x-chatspot-node";

const groups: { title: string; types: NodeType[] }[] = [
  { title: "Начало", types: ["trigger"] },
  { title: "Шаги", types: ["message", "condition", "action", "ai_response"] },
  { title: "Завершение", types: ["end"] },
  { title: "Пометки", types: ["note"] },
];

export function NodePalette({ onAdd, hasTrigger }: { onAdd: (type: NodeType) => void; hasTrigger: boolean }) {
  return (
    <nav aria-label="Блоки сценария" className="space-y-4 p-3">
      {groups.map((g) => (
        <div key={g.title} className="space-y-1.5">
          <p className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{g.title}</p>
          {g.types.map((type) => {
            const meta = nodeMeta[type];
            const Icon = meta.icon;
            const disabled = type === "trigger" && hasTrigger;
            return (
              <button
                key={type}
                type="button"
                draggable={!disabled}
                disabled={disabled}
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_MIME, type);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => onAdd(type)}
                title={disabled ? "В сценарии может быть только один триггер" : `Нажмите или перетащите, чтобы добавить блок «${meta.label}»`}
                className={cn(
                  "flex w-full cursor-grab items-center gap-2.5 rounded-lg border bg-card p-2 text-left text-sm shadow-xs transition-colors outline-none hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
                  disabled && "cursor-not-allowed opacity-50 hover:border-border hover:bg-card",
                )}
              >
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", meta.accent)}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{meta.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{meta.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
      <p className="px-1 text-xs text-muted-foreground">Перетащите блок на холст или нажмите на него. Чтобы соединить блоки, потяните от точки на краю блока.</p>
    </nav>
  );
}
