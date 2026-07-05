/**
 * 文件职责：认证 HTTP 控制器。
 * 负责把请求/响应、Cookie、CSRF、登录上下文与 auth service 串起来，具体凭证创建和校验逻辑放在 service 层。
 */
import { createHttpError } from "../../middlewares/error.middleware.js";
import { revokeRefreshToken, rotateRefreshToken, type AuthTokenPair } from "./auth-session.service.js";
import { blacklistJwt } from "./auth-token.service.js";
import { loginUser, registerUser } from "./auth.service.js";
import { clearAuthCookies, csrfTokensMatch, readRefreshTokenCookie, setAuthCookies } from "./authCookie.js";
import { getValidated } from "../../utils/getValidated.js";
import { success } from "../../utils/response.js";

import type {
  ValidatedLoginSchema,
  ValidatedLogoutSchema,
  ValidatedRefreshSchema,
  ValidatedRegisterSchema,
} from "./auth.schema.js";
import type { AppJwtUser } from "../../types/jwt-user.js";
import type { Request, Response } from "express";

function authContext(req: Request) {
  return {
    userAgent: req.get("user-agent"),
    ipAddress: req.ip,
  };
}

function sendTokenPair(res: Response, msg: string, pair: AuthTokenPair) {
  setAuthCookies(res, pair);
  return success(res, msg, {
    accessToken: pair.accessToken,
    refreshToken: pair.refreshToken,
    accessTokenExpiresIn: pair.accessTokenExpiresIn,
    refreshTokenExpiresIn: pair.refreshTokenExpiresIn,
  });
}

export async function register(req: Request, res: Response) {
  const { body } = getValidated<ValidatedRegisterSchema>(req);
  await registerUser(body);
  return success(res, "注册成功");
}

export async function login(req: Request, res: Response) {
  const { body } = getValidated<ValidatedLoginSchema>(req);
  const pair = await loginUser(body, authContext(req));
  return sendTokenPair(res, "登录成功", pair);
}

export async function refresh(req: Request, res: Response) {
  const validated = getValidated<ValidatedRefreshSchema>(req);
  const bodyRefreshToken = validated.body?.refreshToken;
  const refreshToken = bodyRefreshToken ?? readRefreshTokenCookie(req);
  if (!refreshToken) {
    throw createHttpError(401, "refresh token 无效或已过期");
  }
  if (!bodyRefreshToken && !csrfTokensMatch(req)) {
    // refreshToken 来自 Cookie 时会被浏览器自动附带，需要 CSRF 头；请求体显式传 token 时按 Bearer 类客户端处理。
    throw createHttpError(403, "CSRF token 无效或缺失");
  }

  const pair = await rotateRefreshToken(refreshToken, authContext(req));
  return sendTokenPair(res, "刷新成功", pair);
}

export async function logout(req: Request, res: Response) {
  const validated = getValidated<ValidatedLogoutSchema>(req);
  const { jti, exp } = req.user as AppJwtUser;
  if (!jti || !exp) {
    throw createHttpError(401, "无效登录凭证");
  }

  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = exp - now;

  if (ttlSeconds > 0) {
    // access token 是无状态 JWT，只能用 jti 黑名单实现“登出后立刻失效”，TTL 与 token 剩余寿命一致。
    await blacklistJwt(jti, ttlSeconds);
  }

  await revokeRefreshToken(validated.body?.refreshToken ?? readRefreshTokenCookie(req));
  clearAuthCookies(res);

  return success(res, "退出登录成功");
}
