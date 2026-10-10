import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { AppError } from "./errors";
import { logger } from "./logger";

/**
 * Runs a Server Action body and converts known failures into an ActionResult.
 * Unknown errors are logged and reported generically (no internals leak to the client).
 */
export async function runAction<T>(name: string, fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err); // let redirect()/notFound() propagate
    if (err instanceof z.ZodError) {
      return { ok: false, error: "Исправьте отмеченные поля", fieldErrors: z.flattenError(err).fieldErrors };
    }
    if (err instanceof AppError) {
      if (err.code === "internal") logger.error("action.failed", { action: name, err });
      return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    }
    logger.error("action.failed", { action: name, err });
    return { ok: false, error: "Что-то пошло не так. Попробуйте ещё раз." };
  }
}

/** Parses FormData/object input with a Zod schema (throws ZodError on failure). */
export function parseInput<S extends z.ZodType>(schema: S, input: FormData | unknown): z.infer<S> {
  const raw = input instanceof FormData ? Object.fromEntries(input.entries()) : input;
  return schema.parse(raw);
}
