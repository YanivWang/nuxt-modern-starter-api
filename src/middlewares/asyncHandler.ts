import type { HttpAppError } from "./error.middleware.js";
import type { NextFunction, Request, Response } from "express";

// Express 4 默认不会捕获异步路由里 reject 的 Promise，须在路由内 try/catch 并 next(err)，或使用本函数的包装。

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void | Response>,
  failureMessage?: string,
) {
  // 将 controller 中的异步函数包成中间件，统一 try/catch，把异常交给错误处理中间件
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      // 异步异常在 asyncHandler 里接
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      const httpErr = normalizedError as HttpAppError;
      httpErr.failureMessage = httpErr.failureMessage ?? failureMessage;

      // next(error)：Express 会跳到已注册的错误处理中间件
      next(normalizedError);
    }
  };
}
