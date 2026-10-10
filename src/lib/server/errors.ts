/** Domain errors thrown by services and mapped to user-facing results by actions. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "forbidden" | "unauthenticated" | "validation" | "conflict" | "internal",
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Resource") => new AppError(`${what} not found`, "not_found");
export const forbidden = (msg = "You don't have permission to do that") => new AppError(msg, "forbidden");
export const conflict = (msg: string) => new AppError(msg, "conflict");
export const validationError = (msg: string, fieldErrors?: Record<string, string[]>) =>
  new AppError(msg, "validation", fieldErrors);
