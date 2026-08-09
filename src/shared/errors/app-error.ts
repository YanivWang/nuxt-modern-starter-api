/** 文件职责：定义与 HTTP 框架解耦的应用错误分类。 */
export type AppErrorCode =
  "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "GONE" | "INTERNAL";

export class AppError extends Error {
  readonly expose: boolean;

  constructor(
    public readonly code: AppErrorCode,
    message: string,
    options: { expose?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.expose = options.expose ?? code !== "INTERNAL";
  }
}

export const badRequest = (message: string) => new AppError("BAD_REQUEST", message);
export const unauthorized = (message: string) => new AppError("UNAUTHORIZED", message);
export const forbidden = (message: string) => new AppError("FORBIDDEN", message);
export const notFound = (message: string) => new AppError("NOT_FOUND", message);
export const conflict = (message: string) => new AppError("CONFLICT", message);
export const gone = (message: string) => new AppError("GONE", message);
export const internalError = (logMessage: string, cause?: unknown) =>
  new AppError("INTERNAL", logMessage, { expose: false, cause });
