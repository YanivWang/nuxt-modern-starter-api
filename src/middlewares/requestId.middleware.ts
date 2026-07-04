import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

const HEADER = "x-request-id";

/** 透传客户端 X-Request-Id，否则生成 UUID，并写回响应头便于追踪 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get(HEADER);
  const trimmed = incoming?.trim();
  const id = trimmed ? trimmed.slice(0, 128) : randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
