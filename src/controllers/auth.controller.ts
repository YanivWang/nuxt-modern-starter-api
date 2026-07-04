import { createHttpError } from "../middlewares/error.middleware.js";
import { revokeRefreshToken, rotateRefreshToken, type AuthTokenPair } from "../services/auth-session.service.js";
import { blacklistJwt } from "../services/auth-token.service.js";
import { loginUser, registerUser } from "../services/auth.service.js";
import { clearAuthCookies, readRefreshTokenCookie, setAuthCookies } from "../utils/authCookie.js";
import { getValidated } from "../utils/getValidated.js";
import { success } from "../utils/response.js";

import type {
  ValidatedLoginSchema,
  ValidatedLogoutSchema,
  ValidatedRefreshSchema,
  ValidatedRegisterSchema,
} from "../schema/auth.schema.js";
import type { AppJwtUser } from "../types/jwt-user.js";
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
    token: pair.accessToken,
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
  const refreshToken = validated.body?.refreshToken ?? readRefreshTokenCookie(req);
  if (!refreshToken) {
    throw createHttpError(401, "refresh token 无效或已过期");
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
    // 如果JWT的过期时间大于当前时间，则把JWT加入黑名单
    // 这样用户在过期时间内再次使用该JWT时，会返回401错误
    await blacklistJwt(jti, ttlSeconds);
  }

  await revokeRefreshToken(validated.body?.refreshToken ?? readRefreshTokenCookie(req));
  clearAuthCookies(res);

  return success(res, "退出登录成功");
}
