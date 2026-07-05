/**
 * 文件职责：统一错误类型与 Express 错误处理中间件。
 * 把业务错误、Multer 错误、唯一键冲突和未知异常统一转换为 { code, message, data } 响应，并写入结构化日志。
 */
import multer from "multer";
import { UniqueConstraintError } from "sequelize";

import { expressRoutePath } from "../utils/expressRoutePath.js";
import { logger, serializeError } from "../utils/logger.js";
import { fail } from "../utils/response.js";

import type { ErrorRequestHandler } from "express";

export interface HttpAppError extends Error {
  statusCode?: number;
  expose?: boolean;
  failureMessage?: string;
}

export function createHttpError(statusCode: number, msg: string): HttpAppError {
  const error = new Error(msg) as HttpAppError;
  error.statusCode = statusCode;
  error.expose = true;
  return error;
}

/** 仅日志可见详情；返回给客户端的统一文案由 failureMessage 决定 */
export function createInternalServerError(logMessage: string): HttpAppError {
  const error = new Error(logMessage) as HttpAppError;
  error.statusCode = 500;
  error.expose = false;
  error.failureMessage = "服务器内部错误";
  return error;
}

export const errorMiddleware: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  // 上传错误优先归一化为业务可读文案，避免把 multer 内部错误码直接暴露给客户端。
  if (error instanceof multer.MulterError) {
    const map: Record<string, string> = {
      LIMIT_FILE_SIZE: "单文件大小超出限制",
      LIMIT_FILE_COUNT: "上传文件数量过多",
      LIMIT_UNEXPECTED_FILE: "请使用表单字段名 files 上传",
    };
    fail(res, 400, map[error.code] || error.message);
    return;
  }

  const jpegGuardMsg =
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : undefined;
  if (jpegGuardMsg?.startsWith("仅支持 jpeg")) {
    fail(res, 400, jpegGuardMsg);
    return;
  }

  if (error instanceof UniqueConstraintError) {
    fail(res, 409, "用户名已存在");
    return;
  }

  const httpErr = error as HttpAppError;
  const statusCode = httpErr.statusCode ?? 500;
  const expose = httpErr.expose === true;
  // expose=true 的错误可把 message 返回给客户端；其他错误只返回 failureMessage 或统一 500。
  const msg = expose ? (httpErr.message ?? "请求处理失败") : (httpErr.failureMessage ?? "服务器内部错误");

  const logPayload = {
    requestId: req.requestId,
    userId: req.user?.id,
    routePath: expressRoutePath(req),
    error: serializeError(error),
    method: req.method,
    url: req.originalUrl,
    statusCode: statusCode,
    clientMsg: msg,
  };

  if (statusCode >= 500) {
    logger.error("request_error", logPayload);
  } else {
    logger.warn("request_client_error", logPayload);
  }

  fail(res, statusCode, msg);
};
