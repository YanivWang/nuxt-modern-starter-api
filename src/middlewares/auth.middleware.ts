/**
 * 文件职责：强制登录认证中间件。
 * 支持 Bearer token 与 access_token Cookie；Cookie 认证的非安全方法会额外校验 CSRF token。
 */
import jwt from "jsonwebtoken";

import { requireJwtUser } from "../modules/auth/jwt-verify.service.js";
import { csrfTokensMatch, readAccessTokenCookie } from "../modules/auth/authCookie.js";

import { createHttpError } from "./error.middleware.js";

import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authorization = req.headers.authorization ?? "";
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const cookieToken = readAccessTokenCookie(req) || "";
  // Bearer 优先，便于移动端/第三方客户端显式管理 token；浏览器同站点请求可退回 httpOnly cookie。
  const token = bearerToken || cookieToken;

  if (!token) {
    next(createHttpError(401, "未登录或无效登录凭证"));
    return;
  }

  if (!bearerToken && !SAFE_METHODS.has(req.method) && !csrfTokensMatch(req)) {
    // 只有 Cookie 认证会自动随请求携带，因此非安全方法必须用双提交 CSRF token 证明请求来自可信前端。
    next(createHttpError(403, "CSRF token 无效或缺失"));
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
