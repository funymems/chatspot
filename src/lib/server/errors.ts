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

export const notFound = (what = "объект") => new AppError(`Не найдено: ${what}`, "not_found");
export const forbidden = (msg = "У вас нет прав на это действие") => new AppError(msg, "forbidden");
export const conflict = (msg: string) => new AppError(msg, "conflict");
export const validationError = (msg: string, fieldErrors?: Record<string, string[]>) =>
  new AppError(msg, "validation", fieldErrors);
