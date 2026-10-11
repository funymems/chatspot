/** Russian display labels for status values (shared by server messages and UI). */
export const runStatusLabels: Record<string, string> = {
  queued: "в очереди",
  running: "выполняется",
  waiting: "ожидает",
  completed: "завершён",
  failed: "ошибка",
  cancelled: "отменён",
};

/** Russian plural form: plural(5, ["запуск", "запуска", "запусков"]) → "запусков". */
export function plural(n: number, [one, few, many]: [string, string, string]) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
