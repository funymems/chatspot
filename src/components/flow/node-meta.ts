import { Bot, CircleStop, GitFork, MessageSquareText, StickyNote, Zap, Wrench, type LucideIcon } from "lucide-react";
import type { NodeType } from "@/lib/domain/graph/schema";

export const nodeMeta: Record<NodeType, { label: string; icon: LucideIcon; accent: string; description: string }> = {
  trigger: { label: "Trigger", icon: Zap, accent: "bg-violet-600 text-white", description: "Starts the flow" },
  message: { label: "Message", icon: MessageSquareText, accent: "bg-sky-600 text-white", description: "Send one or more messages" },
  condition: { label: "Condition", icon: GitFork, accent: "bg-amber-500 text-white", description: "Branch on a rule" },
  action: { label: "Action", icon: Wrench, accent: "bg-emerald-600 text-white", description: "Tag, set fields, capture, wait" },
  ai_response: { label: "AI response", icon: Bot, accent: "bg-fuchsia-600 text-white", description: "Reply with an AI agent" },
  note: { label: "Note", icon: StickyNote, accent: "bg-yellow-400 text-yellow-950", description: "Annotation, never runs" },
  end: { label: "End", icon: CircleStop, accent: "bg-zinc-700 text-white", description: "Finish the run" },
};
