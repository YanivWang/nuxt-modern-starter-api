import { createHttpError } from "../middlewares/error.middleware.js";
import {
  findUserProfileByUserId,
  upsertUserProfileForUser,
} from "../services/user-profile.service.js";
import { findPublicProfileById } from "../services/user.service.js";
import { success } from "../utils/response.js";

import type { ValidatedPatchMyProfileSchema } from "../schema/user-profile.schema.js";
import type { Request, Response } from "express";

export async function getMe(req: Request, res: Response) {
  const uid = req.user?.id;
  if (typeof uid !== "number" || !Number.isFinite(uid)) {
    throw createHttpError(401, "未登录或登录已过期");
  }
  const user = await findPublicProfileById(uid);
  if (!user) {
    throw createHttpError(401, "用户不存在或登录已失效，请重新登录");
  }
  return success(res, "获取当前用户成功", { user });
}

export async function getMyProfile(req: Request, res: Response) {
  const uid = req.user?.id;
  if (typeof uid !== "number" || !Number.isFinite(uid)) {
    throw createHttpError(401, "未登录或登录已过期");
  }
  const profile = await findUserProfileByUserId(uid);
  return success(res, "获取用户扩展资料成功", { profile });
}

export async function patchMyProfile(req: Request, res: Response) {
  const uid = req.user?.id;
  if (typeof uid !== "number" || !Number.isFinite(uid)) {
    throw createHttpError(401, "未登录或登录已过期");
  }
  const validated = req.validated as ValidatedPatchMyProfileSchema;
  const profile = await upsertUserProfileForUser(uid, validated.body);
  return success(res, "更新用户资料成功", { profile });
}
