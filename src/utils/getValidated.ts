/**
 * 文件职责：读取 validate 中间件写入的校验结果。
 * 若缺失 req.validated，说明路由漏挂 validate，应视为服务端配置错误。
 */
import { internalError } from "../shared/errors/app-error.js";

import type { Request } from "express";

/** 读取 `validate()` 写入的 Zod 结果；缺失视为路由配置错误 */
export function getValidated<T>(req: Request): T {
  if (req.validated === undefined) {
    throw internalError("路由缺少 validate 中间件或校验未执行");
  }
  return req.validated as T;
}
