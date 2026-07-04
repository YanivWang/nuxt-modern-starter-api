import { createInternalServerError } from "../middlewares/error.middleware.js";

import type { Request } from "express";

/** 读取 `validate()` 写入的 Zod 结果；缺失视为路由配置错误 */
export function getValidated<T>(req: Request): T {
  if (req.validated === undefined) {
    throw createInternalServerError("路由缺少 validate 中间件或校验未执行");
  }
  return req.validated as T;
}
