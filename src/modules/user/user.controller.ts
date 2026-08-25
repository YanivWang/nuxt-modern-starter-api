/**
 * 文件职责：当前用户与扩展资料接口的 HTTP 适配层。
 * 统一从 req.user 读取登录用户 id，缺失或非法时按未登录处理。
 */
import { unauthorized } from "../../shared/errors/app-error.js";
import { success } from "../../utils/response.js";

import type { UserProfileService } from "./user-profile.service.js";
import type { UserService } from "./user.service.js";
import type { ValidatedPatchMyProfileSchema } from "./user-profile.schema.js";
import type { Request, Response } from "express";

function currentUserId(req: Request) {
  const id = req.user?.id;
  if (typeof id !== "number" || !Number.isFinite(id)) throw unauthorized("未登录或登录已过期");
  return id;
}

export function createUserController(users: UserService, profiles: UserProfileService) {
  return {
    getMe: async (req: Request, res: Response) => {
      const user = await users.findPublicProfileById(currentUserId(req));
      if (!user) throw unauthorized("用户不存在或登录已失效，请重新登录");
      return success(res, "获取当前用户成功", { user });
    },
    getProfile: async (req: Request, res: Response) => {
      const profile = await profiles.findByUserId(currentUserId(req));
      return success(res, "获取用户扩展资料成功", { profile });
    },
    patchProfile: async (req: Request, res: Response) => {
      const profile = await profiles.upsertForUser(
        currentUserId(req),
        (req.validated as ValidatedPatchMyProfileSchema).body,
      );
      return success(res, "更新用户资料成功", { profile });
    },
  };
}

export type UserController = ReturnType<typeof createUserController>;
