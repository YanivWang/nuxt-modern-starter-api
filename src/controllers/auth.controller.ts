import { createHttpError } from "../middlewares/error.middleware.js";
import { blacklistJwt } from "../services/auth-token.service.js";
import { loginUser, registerUser } from "../services/auth.service.js";
import { getValidated } from "../utils/getValidated.js";
import { success } from "../utils/response.js";

import type { ValidatedLoginSchema, ValidatedRegisterSchema } from "../schema/auth.schema.js";
import type { AppJwtUser } from "../types/jwt-user.js";
import type { Request, Response } from "express";

export async function register(req: Request, res: Response) {
  const { body } = getValidated<ValidatedRegisterSchema>(req);
  await registerUser(body);
  return success(res, "注册成功");
}

export async function login(req: Request, res: Response) {
  const { body } = getValidated<ValidatedLoginSchema>(req);
  const token = await loginUser(body);
  return success(res, "登录成功", { token });
}

export async function logout(req: Request, res: Response) {
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

  return success(res, "退出登录成功");
}
