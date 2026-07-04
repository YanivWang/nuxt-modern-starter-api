import jwt from "jsonwebtoken";

import { JWT_SECRET } from "../env.js";

import { isJwtBlacklisted } from "./auth-token.service.js";

import type { AppJwtUser } from "../types/jwt-user.js";

/** 校验 JWT；无效、过期、缺 jti、已拉黑 → null（不抛错） */
export async function resolveJwtUser(token: string): Promise<AppJwtUser | null> {
  try {
    const user = jwt.verify(token, JWT_SECRET) as AppJwtUser;
    if (!user.jti) return null;
    if (await isJwtBlacklisted(user.jti)) return null;
    return user;
  } catch {
    return null;
  }
}

/** 校验 JWT；失败抛 Error，供 auth 中间件映射为 401 */
export async function requireJwtUser(token: string): Promise<AppJwtUser> {
  try {
    const user = jwt.verify(token, JWT_SECRET) as AppJwtUser;
    if (!user.jti) {
      throw new jwt.JsonWebTokenError("missing jti");
    }
    if (await isJwtBlacklisted(user.jti)) {
      throw new jwt.TokenExpiredError("blacklisted", new Date());
    }
    return user;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw error;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw error;
    }
    throw error;
  }
}
