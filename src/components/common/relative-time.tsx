"use client";

import { useSyncExternalStore } from "react";

// A shared one-minute ticker so every <RelativeTime> updates together.
const listeners = new Set<() => void>();
let now = 0;
let timer: ReturnType<typeof setInterval> | undefined;
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 60_000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
const getSnapshot = () => now || Date.now();
const getServerSnapshot = () => 0;

const rtf = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });
const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

export function formatRelative(date: Date, from: number) {
  const diff = Math.round((date.getTime() - from) / 1000);
  if (Math.abs(diff) < 45) return "только что";
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs || unit === "minute") return rtf.format(Math.round(diff / secs), unit);
  }
  return "только что";
}

/**
 * "5 minutes ago". The server render (and first client render) shows a
 * stable absolute date to avoid hydration mismatches; the relative label
 * appears once the clock is available on the client.
 */
export function RelativeTime({ date, className }: { date: Date | string; className?: string }) {
  const d = typeof date === "string" ? new Date(date) : date;
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const absolute = d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  return (
    <time dateTime={d.toISOString()} title={absolute} className={className}>
      {current ? formatRelative(d, current) : d.toISOString().slice(0, 10)}
    </time>
  );
}
