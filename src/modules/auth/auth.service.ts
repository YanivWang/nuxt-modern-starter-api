/**
 * 文件职责：注册与登录的业务逻辑。
 * 入参由 Zod schema 校验后传入；token 会话创建交给 auth-session.service。
 */
import bcrypt from "bcrypt";

import { User } from "../../db.js";
import { createHttpError } from "../../middlewares/error.middleware.js";
import { logger } from "../../utils/logger.js";

import { createAuthTokenPair } from "./auth-session.service.js";

export async function registerUser(payload: { username: string; password: string }) {
  const hashPwd = await bcrypt.hash(payload.password, 10);
  await User.create({ username: payload.username, password: hashPwd });

  logger.info("register_user", { username: payload.username });
}

export async function loginUser(
  payload: { username: string; password: string },
  context: { userAgent?: string; ipAddress?: string } = {},
) {
  const user = await User.findOne({ where: { username: payload.username } });
  const credentialOk = user ? await bcrypt.compare(payload.password, user.get("password") as string) : false;

  if (!credentialOk || !user) {
    throw createHttpError(401, "用户名或密码错误");
  }

  return createAuthTokenPair(user, context);
}
