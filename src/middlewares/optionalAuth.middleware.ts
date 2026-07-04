import { resolveJwtUser } from "../services/jwt-verify.service.js";

import type { NextFunction, Request, Response } from "express";

/** 有 Bearer 则解析并写入 req.user；无 token、无效、过期或已拉黑则静默按匿名继续 */
export async function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authorization = req.headers.authorization ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) {
    next();
    return;
  }

  try {
    const user = await resolveJwtUser(token);
    if (user) {
      req.user = user;
    }
    next();
  } catch (error) {
    next(error);
  }
}
