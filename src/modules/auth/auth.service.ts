/**
 * 文件职责：注册与登录的业务逻辑。
 * 这里只处理用户名密码归一化、密码哈希/比对和用户查询；token 会话创建交给 auth-session.service。
 */
import bcrypt from "bcrypt";

import { User } from "../../db.js";
import { createHttpError } from "../../middlewares/error.middleware.js";
import { logger } from "../../utils/logger.js";
import { trimmedStringFromUnknown } from "../../utils/trimmedStringFromUnknown.js";

import { createAuthTokenPair } from "./auth-session.service.js";

function normalizeCredentials(username: unknown, password: unknown) {
  return {
    username: trimmedStringFromUnknown(username),
    password: trimmedStringFromUnknown(password),
  };
}

export async function registerUser(payload: { username?: unknown; password?: unknown }) {
  const { username, password } = normalizeCredentials(payload.username, payload.password);

  if (!username || !password) {
    throw createHttpError(400, "用户名或密码不能为空");
  }

  const hashPwd = await bcrypt.hash(password, 10);
  await User.create({ username, password: hashPwd });

  logger.info("register_user", { username });
}

export async function loginUser(
  payload: { username?: unknown; password?: unknown },
  context: { userAgent?: string; ipAddress?: string } = {},
) {
  const { username, password } = normalizeCredentials(payload.username, payload.password);

  if (!username || !password) {
    throw createHttpError(400, "用户名或密码不能为空");
  }

  const user = await User.findOne({ where: { username } });
  const credentialOk = user ? await bcrypt.compare(password, user.get("password") as string) : false;

  if (!credentialOk || !user) {
    throw createHttpError(401, "用户名或密码错误");
  }

  return createAuthTokenPair(user, context);
}
