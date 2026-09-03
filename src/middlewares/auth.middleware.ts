/**
 * 文件职责：强制登录认证中间件。
 * 支持 Bearer token 与 access_token Cookie；Cookie 认证的非安全方法会额外校验 CSRF token。
 */
import jwt from "jsonwebtoken";

import { csrfTokensMatch, readAccessTokenCookie } from "../modules/auth/authCookie.js";

import { asyncMiddleware } from "./asyncHandler.js";

import { AppError, forbidden, unauthorized } from "../shared/errors/app-error.js";

import type { NextFunction, Request, Response } from "express";
import type { JwtVerifier } from "../modules/auth/jwt-verify.service.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type AuthMiddlewareOptions = {
  /** 允许已过期但签名有效的 access token 通过；目前只有登出接口使用。 */
  allowExpired?: boolean;
};

export function createAuthMiddleware(verifier: JwtVerifier, options: AuthMiddlewareOptions = {}) {
  // asyncMiddleware 保证解析 Cookie/校验 token 阶段的任何异常都走 next(error)，
  // 而不是变成会终止进程的未处理 Promise rejection。
  return asyncMiddleware(async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
    const authorization = req.headers.authorization ?? "";
    const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const cookieToken = readAccessTokenCookie(req) || "";
    // Bearer 优先，便于移动端/第三方客户端显式管理 token；浏览器同站点请求可退回 httpOnly cookie。
    const token = bearerToken || cookieToken;

    if (!token) {
      next(unauthorized("未登录或无效登录凭证"));
      return;
    }

    if (!bearerToken && !SAFE_METHODS.has(req.method) && !csrfTokensMatch(req)) {
      // 只有 Cookie 认证会自动随请求携带，因此非安全方法必须用双提交 CSRF token 证明请求来自可信前端。
      next(forbidden("CSRF token 无效或缺失"));
      return;
    }

    try {
      req.user = options.allowExpired ? await verifier.requireAllowExpired(token) : await verifier.require(token);
      next();
    } catch (error) {
      // AppError 是校验流程自己给出的明确结论（如黑名单存储不可用 → 500），原样放行。
      // 一律改写成 401 会把服务端故障说成「你的凭证无效」：客户端据此清掉本地会话，
      // 一次 Redis 抖动就变成全体用户被登出，而日志里只剩一片 401 看不出真因。
      if (error instanceof AppError) {
        next(error);
        return;
      }
      if (error instanceof jwt.TokenExpiredError) {
        next(unauthorized("登录已过期, 请重新登录"));
        return;
      }
      next(unauthorized("无效登录凭证"));
    }
  });
}

export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
