/**
 * 文件职责：注册与登录用例。
 * 密码使用 bcrypt 哈希存储；用户名唯一冲突在此转换为 CONFLICT，登录失败统一返回同一文案避免枚举用户名。
 */
import bcrypt from "bcrypt";
import { UniqueConstraintError } from "sequelize";

import { BCRYPT_ROUNDS, LOGIN_MAX_FAILED_ATTEMPTS } from "../../env.js";
import { conflict, tooManyRequests, unauthorized } from "../../shared/errors/app-error.js";
import { logger } from "../../utils/logger.js";

import type { LoginAttemptTracker } from "./ports/login-attempt-tracker.port.js";
import type { AppDatabase } from "../../db/index.js";
import type { AuthSessionService } from "./auth-session.service.js";

export function createAuthService(
  database: AppDatabase,
  sessions: AuthSessionService,
  loginAttempts: LoginAttemptTracker,
) {
  const { User } = database.models;

  async function register(payload: { username: string; password: string }) {
    const hashPwd = await bcrypt.hash(payload.password, BCRYPT_ROUNDS);
    try {
      await User.create({ username: payload.username, password: hashPwd });
    } catch (error) {
      if (error instanceof UniqueConstraintError) throw conflict("用户名已存在");
      throw error;
    }
    logger.info("register_user", { username: payload.username });
  }

  async function login(
    payload: { username: string; password: string },
    context: { userAgent?: string; ipAddress?: string } = {},
  ) {
    if (await loginAttempts.isLocked(payload.username)) {
      logger.warn("login_locked", { username: payload.username, ipAddress: context.ipAddress });
      throw tooManyRequests("登录失败次数过多，请稍后再试");
    }

    const user = await User.findOne({ where: { username: payload.username } });
    const credentialOk = user ? await bcrypt.compare(payload.password, user.password) : false;

    if (!credentialOk || !user) {
      const failures = await loginAttempts.recordFailure(payload.username);
      if (failures >= LOGIN_MAX_FAILED_ATTEMPTS) {
        logger.warn("login_lockout_triggered", {
          username: payload.username,
          failures,
          ipAddress: context.ipAddress,
        });
      }
      throw unauthorized("用户名或密码错误");
    }

    await loginAttempts.reset(payload.username);
    return sessions.createTokenPair(user, context);
  }

  return { register, login };
}

export type AuthService = ReturnType<typeof createAuthService>;
