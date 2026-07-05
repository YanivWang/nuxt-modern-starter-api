/**
 * 文件职责：统一 API 响应体格式。
 * 成功与失败都使用 { code, message, data } 约定，避免 controller 分散拼响应结构。
 */
import type { Response } from "express";

export function success(res: Response, message: string, data: unknown = null, statusCode = 200) {
  return res.status(statusCode).json({
    code: statusCode,
    message,
    data,
  });
}

export function fail(res: Response, statusCode: number, message: string) {
  return res.status(statusCode).json({
    code: statusCode,
    message,
    data: null,
  });
}
