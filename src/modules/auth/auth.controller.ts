/**
 * 文件职责：认证接口的 HTTP 适配层。
 * 负责读取校验结果、写入/清除认证 Cookie、对 Cookie 来源的凭证补做 CSRF 校验，并调用认证与会话 Service。
 */
import { forbidden, unauthorized } from "../../shared/errors/app-error.js";
import { getValidated } from "../../utils/getValidated.js";
import { success } from "../../utils/response.js";
import { clearAuthCookies, csrfTokensMatch, readRefreshTokenCookie, setAuthCookies } from "./authCookie.js";

import type { AuthSessionService } from "./auth-session.service.js";
import type { AuthTokenPair } from "./auth.contract.js";
import type { AuthService } from "./auth.service.js";
import type {
  ValidatedLoginSchema,
  ValidatedLogoutSchema,
  ValidatedRefreshSchema,
  ValidatedRegisterSchema,
} from "./auth.schema.js";
import type { TokenBlacklist } from "./ports/token-blacklist.port.js";
import type { AppJwtUser } from "../../types/jwt-user.js";
import type { Request, Response } from "express";

const authContext = (req: Request) => ({ userAgent: req.get("user-agent"), ipAddress: req.ip });

function sendTokenPair(res: Response, message: string, pair: AuthTokenPair) {
  setAuthCookies(res, pair);
  return success(res, message, {
    accessToken: pair.accessToken,
    refreshToken: pair.refreshToken,
    accessTokenExpiresIn: pair.accessTokenExpiresIn,
    refreshTokenExpiresIn: pair.refreshTokenExpiresIn,
  });
}

export function createAuthController(auth: AuthService, sessions: AuthSessionService, blacklist: TokenBlacklist) {
  return {
    register: async (req: Request, res: Response) => {
      await auth.register(getValidated<ValidatedRegisterSchema>(req).body);
      return success(res, "注册成功");
    },
    login: async (req: Request, res: Response) => {
      const pair = await auth.login(getValidated<ValidatedLoginSchema>(req).body, authContext(req));
      return sendTokenPair(res, "登录成功", pair);
    },
    refresh: async (req: Request, res: Response) => {
      const validated = getValidated<ValidatedRefreshSchema>(req);
      const bodyToken = validated.body?.refreshToken;
      const refreshToken = bodyToken ?? readRefreshTokenCookie(req);
      if (!refreshToken) throw unauthorized("refresh token 无效或已过期");
      if (!bodyToken && !csrfTokensMatch(req)) throw forbidden("CSRF token 无效或缺失");
      return sendTokenPair(res, "刷新成功", await sessions.rotate(refreshToken, authContext(req)));
    },
    logout: async (req: Request, res: Response) => {
      const validated = getValidated<ValidatedLogoutSchema>(req);
      const { jti, exp } = req.user as AppJwtUser;
      if (!jti || !exp) throw unauthorized("无效登录凭证");
      const ttlSeconds = exp - Math.floor(Date.now() / 1000);
      if (ttlSeconds > 0) await blacklist.add(jti, ttlSeconds);
      await sessions.revoke(validated.body?.refreshToken ?? readRefreshTokenCookie(req));
      clearAuthCookies(res);
      return success(res, "退出登录成功");
    },
  };
}

export type AuthController = ReturnType<typeof createAuthController>;
