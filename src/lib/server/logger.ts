/**
 * Minimal structured logger. Emits one JSON line per event so logs can be
 * shipped to any collector later. Never log secrets, tokens or passwords.
 */
type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel: Level = (process.env.LOG_LEVEL as Level) ?? (process.env.NODE_ENV === "test" ? "warn" : "info");

function serializeError(err: unknown) {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return { message: String(err) };
}

function emit(level: Level, event: string, fields?: Fields) {
  if (order[level] < order[minLevel]) return;
  // performance clock: safe to read during prerendering (unlike Date.now()).
  const entry: Fields = { ts: new Date(performance.timeOrigin + performance.now()).toISOString(), level, event, ...fields };
  if (entry.err !== undefined) entry.err = serializeError(entry.err);
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields?: Fields) => emit("debug", event, fields),
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  error: (event: string, fields?: Fields) => emit("error", event, fields),
};
