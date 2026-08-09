/**
 * 文件职责：包装 Express 4 异步 controller。
 * 捕获 Promise reject 后补充默认失败文案，并交给统一错误处理中间件。
 */
import { internalError } from "../shared/errors/app-error.js";
import type { NextFunction, Request, Response } from "express";

// Express 4 默认不会捕获异步路由里 reject 的 Promise，须在路由内 try/catch 并 next(err)，或使用本函数的包装。

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void | Response>,
  failureMessage?: string,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      if (error instanceof Error) {
        next(failureMessage && error.name !== "AppError" ? internalError(failureMessage, error) : error);
        return;
      }
      next(internalError(failureMessage ?? "请求处理失败", error));
    }
  };
}
