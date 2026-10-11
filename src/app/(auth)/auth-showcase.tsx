"use client";

import { useEffect, useState } from "react";
import { Bot, ExternalLink, MessageSquareText, Tag, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Looping product demo for the auth screen: a DM conversation plays out
 * while the matching automation step lights up in the mini flow below.
 */
type Step =
  | { kind: "in"; text: string }
  | { kind: "typing" }
  | { kind: "out"; text: string; chips?: string[]; link?: string };

const script: { step: Step; node: number; ms: number }[] = [
  { step: { kind: "in", text: "Привет! Хочу КУРС 🙌" }, node: 0, ms: 1400 },
  { step: { kind: "typing" }, node: 1, ms: 1100 },
  { step: { kind: "out", text: "Привет, Айгерим! 🎓 Какой курс вам интересен?", chips: ["Для начинающих", "Продвинутый"] }, node: 1, ms: 1900 },
  { step: { kind: "in", text: "Для начинающих" }, node: 1, ms: 1200 },
  { step: { kind: "typing" }, node: 2, ms: 1000 },
  { step: { kind: "out", text: "Отличный выбор! Вот ссылка на курс 🚀", link: "Курс для начинающих" }, node: 2, ms: 1500 },
  { step: { kind: "typing" }, node: 3, ms: 900 },
];
const HOLD_MS = 3200;

const nodes = [
  { icon: Zap, label: "Триггер", detail: "«КУРС»", tone: "bg-violet-500" },
  { icon: MessageSquareText, label: "Сообщение", detail: "уровень курса", tone: "bg-sky-500" },
  { icon: MessageSquareText, label: "Сообщение", detail: "ссылка", tone: "bg-sky-500" },
  { icon: Tag, label: "Действие", detail: "тег «лид»", tone: "bg-emerald-500" },
];

function useLoop(reduced: boolean) {
  const [state, setState] = useState({ count: 1, cycle: 0 });
  useEffect(() => {
    if (reduced) return;
    const delay = state.count >= script.length ? HOLD_MS : script[state.count - 1]!.ms;
    const t = setTimeout(
      () => setState((s) => (s.count >= script.length ? { count: 1, cycle: s.cycle + 1 } : { ...s, count: s.count + 1 })),
      delay,
    );
    return () => clearTimeout(t);
  }, [state, reduced]);
  return reduced ? { count: script.length, cycle: 0 } : state;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

export function AuthShowcase() {
  const reduced = useReducedMotion();
  const { count, cycle } = useLoop(reduced);
  const visible = script.slice(0, count).map((s, i) => ({ ...s, key: `${cycle}-${i}` }));
  const last = visible.at(-1)!;
  // Typing indicators are transient: only the latest one is shown (never in the final, held frame).
  const bubbles = visible.filter((s, i) => s.step.kind !== "typing" || (i === visible.length - 1 && count < script.length));
  const finished = count >= script.length;
  const activeNode = finished ? 3 : last.node;

  return (
    <div className="relative w-full max-w-[26rem]" aria-hidden>
      {/* Chat window */}
      <div className="cs-float relative rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-violet-950/50 backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-2.5 border-b border-white/10 pb-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 via-violet-500 to-amber-400 p-[2px]">
            <span className="flex size-full items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">А</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-white">aigerim.studio</span>
            <span className="flex items-center gap-1 text-[11px] text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-400" /> Instagram Direct
            </span>
          </span>
          <span className="flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-200">
            <Bot className="size-3" /> автоответ
          </span>
        </div>

        <div className="flex h-[196px] flex-col justify-end gap-2 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_18%)]">
          {bubbles.map(({ step, key }) => (
            <Bubble key={key} step={step} />
          ))}
        </div>
      </div>

      {/* Mini flow, in sync with the conversation */}
      <div className="relative mt-4 grid grid-cols-4 gap-2">
        <svg className="pointer-events-none absolute inset-x-6 top-1/2 h-px w-[calc(100%-3rem)] -translate-y-1/2 overflow-visible" preserveAspectRatio="none">
          <line x1="0" y1="0" x2="100%" y2="0" stroke="rgb(167 139 250 / 0.5)" strokeWidth="1.5" className="cs-dash" />
        </svg>
        {nodes.map((n, i) => {
          const Icon = n.icon;
          const on = i <= activeNode;
          return (
            <div
              key={i}
              className={cn(
                "relative rounded-xl border px-2 py-2 text-center transition-all duration-500",
                on ? "border-violet-400/50 bg-zinc-900/90 shadow-lg shadow-violet-500/20" : "border-white/10 bg-zinc-900/60 opacity-60",
                i === activeNode && !finished && "scale-105 border-violet-300/80",
              )}
            >
              <span className={cn("mx-auto mb-1 flex size-6 items-center justify-center rounded-md text-white transition-colors", on ? n.tone : "bg-white/10")}>
                <Icon className="size-3.5" />
              </span>
              <span className="block truncate text-[11px] font-medium text-white">{n.label}</span>
              <span className="block truncate text-[10px] text-white/50">{n.detail}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Bubble({ step }: { step: Step }) {
  if (step.kind === "typing") {
    return (
      <div className="cs-rise flex justify-end">
        <span className="cs-typing flex gap-1 rounded-2xl rounded-br-md bg-violet-600/80 px-3 py-2.5">
          <span className="size-1.5 rounded-full bg-white" />
          <span className="size-1.5 rounded-full bg-white" />
          <span className="size-1.5 rounded-full bg-white" />
        </span>
      </div>
    );
  }
  if (step.kind === "in") {
    return (
      <div className="cs-rise flex justify-start">
        <span className="max-w-[78%] rounded-2xl rounded-bl-md bg-white/10 px-3 py-2 text-[13px] text-white">{step.text}</span>
      </div>
    );
  }
  return (
    <div className="cs-rise flex flex-col items-end gap-1.5">
      <span className="max-w-[82%] rounded-2xl rounded-br-md bg-gradient-to-br from-violet-500 to-fuchsia-600 px-3 py-2 text-[13px] text-white shadow-lg shadow-fuchsia-900/30">
        {step.text}
      </span>
      {step.chips && (
        <span className="flex flex-wrap justify-end gap-1.5">
          {step.chips.map((c) => (
            <span key={c} className="rounded-full border border-violet-300/40 px-2.5 py-0.5 text-[11px] text-violet-100">
              {c}
            </span>
          ))}
        </span>
      )}
      {step.link && (
        <span className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white">
          {step.link} <ExternalLink className="size-3" />
        </span>
      )}
    </div>
  );
}
