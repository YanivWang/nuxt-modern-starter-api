import { createHttpError } from "./error.middleware.js";

import type { NextFunction, Request, Response } from "express";
import type * as z from "zod";

type ParsedParts = {
  body?: unknown;
  query?: unknown;
  params?: unknown;
  headers?: unknown;
};

/** Zod 校验 body/query/params/headers，成功后写入 `req.validated` */
export function validate<A extends ParsedParts>(schema: z.ZodType<A>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body as unknown,
      query: req.query as unknown,
      params: req.params as unknown,
      headers: req.headers,
    });

    if (!result.success) {
      const message = result.error.issues.map((issue) => issue.message).join("; ");
      // 校验失败：400，交由全局 error 中间件输出统一错误体
      next(createHttpError(400, message));
      return;
    }

    req.validated = result.data;

    next();
  };
}
