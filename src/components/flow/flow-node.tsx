"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { describeNode } from "@/lib/domain/graph/describe";
import { nodeDisplayName } from "@/lib/domain/graph/validate";
import type { GraphNode, NodeType } from "@/lib/domain/graph/schema";
import { cn } from "@/lib/utils";
import { nodeMeta } from "./node-meta";

export type RunStatus = "running" | "success" | "failed" | "waiting" | "skipped";

export type FlowNodeData = {
  node: GraphNode;
  /** Number of validation errors on this node. */
  errorCount?: number;
  isStart?: boolean;
  runStatus?: RunStatus;
};
export type FlowNode = Node<FlowNodeData, NodeType>;

const noteColors = {
  yellow: "border-yellow-300 bg-yellow-50 text-yellow-950",
  blue: "border-sky-300 bg-sky-50 text-sky-950",
  green: "border-emerald-300 bg-emerald-50 text-emerald-950",
  pink: "border-pink-300 bg-pink-50 text-pink-950",
  gray: "border-zinc-300 bg-zinc-50 text-zinc-900",
} as const;

const handleClass = "!size-3 !border-2 !border-background !bg-muted-foreground/60";

export function FlowNodeCard({ data, selected }: NodeProps<FlowNode>) {
  const { node, errorCount = 0, isStart, runStatus } = data;
  const meta = nodeMeta[node.type];
  const Icon = meta.icon;
  const lines = describeNode(node);

  if (node.type === "note") {
    const color = (node.data as { color?: keyof typeof noteColors }).color ?? "yellow";
    return (
      <div className={cn("w-56 rounded-lg border p-3 text-xs shadow-sm", noteColors[color] ?? noteColors.yellow, selected && "ring-2 ring-primary")}>
        <div className="mb-1 flex items-center gap-1.5 font-medium">
          <Icon className="size-3.5" aria-hidden /> {nodeDisplayName(node)}
        </div>
        <p className="whitespace-pre-wrap">{lines[0]}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative w-64 rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow",
        selected && "ring-2 ring-primary",
        errorCount > 0 && "border-destructive/60",
        runStatus === "success" && "ring-2 ring-success/70",
        runStatus === "failed" && "ring-2 ring-destructive",
        runStatus === "running" && "ring-2 ring-primary/60",
        runStatus === "waiting" && "ring-2 ring-warning",
      )}
    >
      {node.type !== "trigger" && <Handle type="target" position={Position.Top} className={handleClass} />}
      {isStart && (
        <span className="absolute -top-2.5 left-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
          START
        </span>
      )}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className={cn("flex size-6 items-center justify-center rounded-md", meta.accent)}>
          <Icon className="size-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{nodeDisplayName(node)}</span>
        {errorCount > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-destructive" title={`${errorCount} problem(s)`}>
            <AlertTriangle className="size-3.5" aria-hidden /> {errorCount}
          </span>
        )}
        {runStatus === "success" && <CheckCircle2 className="size-4 text-success" aria-label="Succeeded" />}
        {runStatus === "failed" && <XCircle className="size-4 text-destructive" aria-label="Failed" />}
        {runStatus === "running" && <Loader2 className="size-4 animate-spin text-primary" aria-label="Running" />}
        {runStatus === "waiting" && <Clock className="size-4 text-warning" aria-label="Waiting" />}
      </div>
      <div className="space-y-0.5 px-3 py-2 text-xs text-muted-foreground">
        {lines.map((l, i) => (
          <p key={i} className={cn("line-clamp-2", i === 0 && "text-foreground/80")}>
            {l}
          </p>
        ))}
      </div>
      {node.type === "condition" ? (
        <>
          <Handle id="true" type="source" position={Position.Bottom} style={{ left: "30%" }} className={cn(handleClass, "!bg-success")} />
          <Handle id="false" type="source" position={Position.Bottom} style={{ left: "70%" }} className={cn(handleClass, "!bg-destructive")} />
          <div className="flex justify-between px-[22%] pb-1 text-[10px] font-medium uppercase tracking-wide">
            <span className="text-success">Yes</span>
            <span className="text-destructive">No</span>
          </div>
        </>
      ) : node.type !== "end" ? (
        <Handle id="out" type="source" position={Position.Bottom} className={handleClass} />
      ) : null}
    </div>
  );
}

export const flowNodeTypes = {
  trigger: FlowNodeCard,
  message: FlowNodeCard,
  condition: FlowNodeCard,
  action: FlowNodeCard,
  ai_response: FlowNodeCard,
  note: FlowNodeCard,
  end: FlowNodeCard,
};
