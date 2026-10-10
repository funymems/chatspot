import { Bot, CircleStop, GitFork, MessageSquareText, StickyNote, Zap, Wrench, type LucideIcon } from "lucide-react";
import type { NodeType } from "@/lib/domain/graph/schema";

export const nodeMeta: Record<NodeType, { label: string; icon: LucideIcon; accent: string; description: string }> = {
  trigger: { label: "Триггер", icon: Zap, accent: "bg-violet-600 text-white", description: "Запускает сценарий" },
  message: { label: "Сообщение", icon: MessageSquareText, accent: "bg-sky-600 text-white", description: "Отправляет одно или несколько сообщений" },
  condition: { label: "Условие", icon: GitFork, accent: "bg-amber-500 text-white", description: "Ветвление по правилу" },
  action: { label: "Действие", icon: Wrench, accent: "bg-emerald-600 text-white", description: "Теги, поля, сбор данных, пауза" },
  ai_response: { label: "Ответ ИИ", icon: Bot, accent: "bg-fuchsia-600 text-white", description: "Отвечает с помощью ИИ-агента" },
  note: { label: "Заметка", icon: StickyNote, accent: "bg-yellow-400 text-yellow-950", description: "Комментарий, не выполняется" },
  end: { label: "Конец", icon: CircleStop, accent: "bg-zinc-700 text-white", description: "Завершает запуск" },
};
