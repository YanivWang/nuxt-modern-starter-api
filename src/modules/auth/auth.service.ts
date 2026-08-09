import bcrypt from "bcrypt";
import { UniqueConstraintError } from "sequelize";

import { conflict, unauthorized } from "../../shared/errors/app-error.js";
import { logger } from "../../utils/logger.js";

import type { AppDatabase } from "../../db/index.js";
import type { AuthSessionService } from "./auth-session.service.js";

export function createAuthService(database: AppDatabase, sessions: AuthSessionService) {
  const { User } = database.models;

  async function register(payload: { username: string; password: string }) {
    const hashPwd = await bcrypt.hash(payload.password, 10);
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
    const user = await User.findOne({ where: { username: payload.username } });
    const credentialOk = user ? await bcrypt.compare(payload.password, user.get("password") as string) : false;
    if (!credentialOk || !user) throw unauthorized("用户名或密码错误");
    return sessions.createTokenPair(user, context);
  }

  return { register, login };
}

export type AuthService = ReturnType<typeof createAuthService>;
