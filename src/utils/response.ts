/**
 * 文件职责：统一 API 响应体格式。
 * 成功与失败都使用 { code, msg, ...data } 约定，避免 controller 分散拼响应结构。
 */
import type { Response } from "express";

export function success(res: Response, msg: string, data: Record<string, unknown> = {}) {
  return res.json({
    code: 200,
    msg,
    ...data,
  });
}

export function fail(res: Response, statusCode: number, msg: string) {
  return res.status(statusCode).json({
    code: statusCode,
    msg,
  });
}
