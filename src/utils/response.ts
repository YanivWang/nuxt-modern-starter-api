/**
 * 文件职责：统一 API 响应体格式。
 * 成功与失败都使用 { code, message, data } 约定，避免 controller 分散拼响应结构。
 *
 * 业务成功时信封 code 固定为 200（与前端 assertApiSuccess 对齐）；
 * HTTP status 仍可通过 statusCode 传 201 等语义状态码。
 */
import type { Response } from "express";

export function success(res: Response, message: string, data: unknown = null, statusCode = 200) {
  return res.status(statusCode).json({
    code: 200,
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
