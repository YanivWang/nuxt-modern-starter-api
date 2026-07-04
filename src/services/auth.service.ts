import { randomUUID } from "node:crypto";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { User } from "../db.js";
import { JWT_SECRET } from "../env.js";
import { createHttpError } from "../middlewares/error.middleware.js";
import { logger } from "../utils/logger.js";
import { trimmedStringFromUnknown } from "../utils/trimmedStringFromUnknown.js";

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

export async function loginUser(payload: { username?: unknown; password?: unknown }) {
  const { username, password } = normalizeCredentials(payload.username, payload.password);

  if (!username || !password) {
    throw createHttpError(400, "用户名或密码不能为空");
  }

  const user = await User.findOne({ where: { username } });
  const credentialOk = user ? await bcrypt.compare(password, user.get("password") as string) : false;

  if (!credentialOk || !user) {
    throw createHttpError(401, "用户名或密码错误");
  }

  const jti = randomUUID();

  return jwt.sign(
    {
      id: user.get("id") as number,
      username: user.get("username") as string,
    },
    JWT_SECRET,
    {
      expiresIn: "7d",
      jwtid: jti,
    },
  );
}
