/**
 * 文件职责：可选登录态中间件。
 * token 有效则写入 req.user，无 token 或 token 无效时按匿名请求继续。
 */
import { resolveJwtUser } from "../modules/auth/jwt-verify.service.js";
import { readAccessTokenCookie } from "../modules/auth/authCookie.js";

import type { NextFunction, Request, Response } from "express";

/** 可选登录态：有 token 且校验通过则写入 req.user，无 token/无效/过期/已拉黑则按匿名继续。 */
export async function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authorization = req.headers.authorization ?? "";
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  // 这里不做 CSRF 校验；该中间件只用于“读身份、允许匿名”的场景，写操作仍应使用 authMiddleware。
  const token = bearerToken || readAccessTokenCookie(req) || "";
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
