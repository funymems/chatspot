"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";

type Day = { day: string; completed: number; failed: number; other: number };

// Status palette (reserved; never reused as series colours). Always paired with labels.
const series = [
  { key: "completed", label: "Успешно", color: "#0ca30c" },
  { key: "failed", label: "Ошибка", color: "#d03b3b" },
  { key: "other", label: "Выполняется", color: "#a1a1aa" },
] as const;

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("ru", { month: "short", day: "numeric", timeZone: "UTC" });

function ChartTooltip({ active, payload, label }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + Number(p.value ?? 0), 0);
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{fmtDay(String(label))}</p>
      {series.map((s) => {
        const v = payload.find((p) => p.dataKey === s.key)?.value ?? 0;
        return (
          <p key={s.key} className="flex items-center gap-2 text-muted-foreground">
            <span className="size-2 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.label}
            <span className="ml-auto pl-4 font-medium tabular-nums text-foreground">{v}</span>
          </p>
        );
      })}
      <p className="mt-1 border-t pt-1 text-muted-foreground">
        Всего <span className="float-right font-medium tabular-nums text-foreground">{total}</span>
      </p>
    </div>
  );
}

export function RunsChart({ data }: { data: Day[] }) {
  const total = data.reduce((s, d) => s + d.completed + d.failed + d.other, 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-hidden>
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
      <div className="h-64" role="img" aria-label={`Запуски автоматизаций по дням: всего ${total}. Ниже есть таблица.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={40} />
            <Tooltip content={(p) => <ChartTooltip {...(p as TooltipContentProps<number, string>)} />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="runs"
                fill={s.color}
                stroke="var(--card)"
                strokeWidth={2}
                radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Показать таблицей</summary>
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border">
          <table className="w-full">
            <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-2 py-1 font-medium">День</th>
                {series.map((s) => (
                  <th key={s.key} className="px-2 py-1 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data
                .filter((d) => d.completed + d.failed + d.other > 0)
                .map((d) => (
                  <tr key={d.day}>
                    <td className="px-2 py-1">{fmtDay(d.day)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{d.completed}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{d.failed}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{d.other}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
