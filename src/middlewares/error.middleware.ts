/**
 * 文件职责：统一错误类型与 Express 错误处理中间件。
 * 把业务错误、Multer 错误、唯一键冲突和未知异常统一转换为 { code, message, data } 响应，并写入结构化日志。
 */
import multer from "multer";
import { UniqueConstraintError } from "sequelize";

import { AppError, type AppErrorCode } from "../shared/errors/app-error.js";
import { expressRoutePath } from "../utils/expressRoutePath.js";
import { logger, serializeError } from "../utils/logger.js";
import { fail } from "../utils/response.js";

import type { ErrorRequestHandler } from "express";

const statusByCode: Record<AppErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GONE: 410,
  TOO_MANY_REQUESTS: 429,
  INTERNAL: 500,
};

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

  if (error instanceof UniqueConstraintError) {
    fail(res, 409, "资源已存在");
    return;
  }

  const appError = error instanceof AppError ? error : null;
  const statusCode = appError ? statusByCode[appError.code] : 500;
  const msg = appError?.expose ? appError.message : "服务器内部错误";

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
