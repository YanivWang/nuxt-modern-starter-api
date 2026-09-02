/**
 * 文件职责：注册与登录用例。
 * 密码使用 bcrypt 哈希存储；用户名唯一冲突在此转换为 CONFLICT，登录失败统一返回同一文案避免枚举用户名。
 *
 * 「同一文案」只挡住了响应内容这一条侧信道，响应耗时是另一条：
 * 用户存在时要跑一次 bcrypt（按 BCRYPT_ROUNDS 大约几百毫秒），不存在时直接返回，
 * 两者差一个数量级，攻击者不用看响应体、只掐表就能把用户名枚举出来。
 * 因此用户不存在时也要跑一次等价的 bcrypt 比较。
 */
import { randomBytes } from "node:crypto";

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

  /**
   * 用户名不存在时用来消耗等量 CPU 的诱饵哈希。
   * 懒加载并缓存：放在启动路径上会让进程多阻塞一次 bcrypt 的时间。
   */
  let decoyHash: string | null = null;
  async function compareAgainstDecoy(password: string) {
    try {
      decoyHash ??= await bcrypt.hash(randomBytes(32).toString("hex"), BCRYPT_ROUNDS);
      await bcrypt.compare(password, decoyHash);
    } catch {
      // 诱饵比较只为抹平耗时，它自己失败不应该把一次「用户名不存在」变成 500。
    }
  }

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
    if (!user) await compareAgainstDecoy(payload.password);

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
