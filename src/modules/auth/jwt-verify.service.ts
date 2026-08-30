/**
 * 文件职责：解析和强制校验 access token。
 * 返回的 resolve/require 分别服务于可选登录态和强制登录态，都会检查 jti 是否已进入黑名单。
 */
import jwt from "jsonwebtoken";

import { JWT_SECRET } from "../../env.js";

import type { TokenBlacklist } from "./ports/token-blacklist.port.js";
import type { AppJwtUser } from "../../types/jwt-user.js";

export function createJwtVerifier(blacklist: TokenBlacklist) {
  return {
    /** 校验 JWT；无效、过期、缺 jti、已拉黑 → null（不抛错） */
    async resolve(token: string): Promise<AppJwtUser | null> {
      try {
        const user = jwt.verify(token, JWT_SECRET) as AppJwtUser;
        if (!user.jti) return null;
        if (await blacklist.has(user.jti)) return null;
        return user;
      } catch {
        return null;
      }
    },
    /** 校验 JWT；失败抛 Error，供 auth 中间件映射为 401 */
    async require(token: string): Promise<AppJwtUser> {
      return assertUsable(jwt.verify(token, JWT_SECRET) as AppJwtUser);
    },
    /**
     * 校验签名与黑名单，但忽略过期时间。
     * 仅供登出使用：access token 过期后用户依然必须能主动撤销 refresh token 会话，
     * 否则「怀疑账号被盗」这个最需要登出的场景反而无法登出。
     * 签名仍然必须有效，因此不会放大攻击面。
     */
    async requireAllowExpired(token: string): Promise<AppJwtUser> {
      return assertUsable(jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as AppJwtUser);
    },
  };

  async function assertUsable(user: AppJwtUser): Promise<AppJwtUser> {
    if (!user.jti) {
      throw new jwt.JsonWebTokenError("missing jti");
    }
    if (await blacklist.has(user.jti)) {
      throw new jwt.TokenExpiredError("blacklisted", new Date());
    }
    return user;
  }
}

export type JwtVerifier = ReturnType<typeof createJwtVerifier>;
