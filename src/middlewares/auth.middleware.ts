import jwt from "jsonwebtoken";

import { requireJwtUser } from "../services/jwt-verify.service.js";

import { createHttpError } from "./error.middleware.js";

import type { NextFunction, Request, Response } from "express";

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authorization = req.headers.authorization ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!token) {
    next(createHttpError(401, "未登录或无效登录凭证"));
    return;
  }

  try {
    req.user = await requireJwtUser(token);
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(createHttpError(401, "登录已过期, 请重新登录"));
      return;
    }
    next(createHttpError(401, "无效登录凭证"));
  }
}
