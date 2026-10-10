/** Serializable result shape returned by every Server Action. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export const ok = <T>(data: T, message?: string): ActionResult<T> => ({ ok: true, data, message });
