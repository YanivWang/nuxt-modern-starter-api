/**
 * 文件职责：包装 Express 4 异步 controller 与异步中间件。
 * 捕获 Promise reject 后补充默认失败文案，并交给统一错误处理中间件。
 */
import { AppError, internalError } from "../shared/errors/app-error.js";
import type { NextFunction, Request, RequestHandler, Response } from "express";

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
        // 用 instanceof 而不是比较 error.name：后者会在任何人重命名类或跨 realm 传递错误时静默失效。
        next(failureMessage && !(error instanceof AppError) ? internalError(failureMessage, error) : error);
        return;
      }
      next(internalError(failureMessage ?? "请求处理失败", error));
    }
  };
}

/**
 * 包装异步中间件，保证任何同步抛出或 Promise reject 都进入 next(error)。
 *
 * 与 asyncHandler 的区别：中间件不属于某个具体接口，不该被套上业务失败文案，
 * 因此这里原样透传错误，由 errorMiddleware 决定状态码。
 *
 * 未包装的 async 中间件在 Express 4 下会产生未处理的 Promise rejection，
 * 而 Node 20+ 默认把未处理 rejection 视为致命错误——即进程崩溃。
 */
export function asyncMiddleware(fn: RequestHandler): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}
