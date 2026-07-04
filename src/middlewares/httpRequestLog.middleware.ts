import { expressRoutePath } from "../utils/expressRoutePath.js";
import { logger } from "../utils/logger.js";

import type { NextFunction, Request, Response } from "express";

/** 响应结束后记录 HTTP 请求元信息与耗时，用于监控 */
export function httpRequestLogMiddleware(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();

  res.on("finish", () => {
    logger.info("http_request", {
      requestId: req.requestId,
      userId: req.user?.id,
      routePath: expressRoutePath(req),
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
  });

  next();
}
