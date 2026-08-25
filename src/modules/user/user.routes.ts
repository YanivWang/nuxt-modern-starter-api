/** 文件职责：注册 /me 与 /me/profile 路由，全部要求登录。 */
import express from "express";

import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { getMyProfileSchema, patchMyProfileSchema } from "./user-profile.schema.js";
import { getMeSchema } from "./user.schema.js";

import type { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import type { UserController } from "./user.controller.js";

export function createUserRoutes(controller: UserController, auth: AuthMiddleware) {
  const router = express.Router();
  router.get("/me", auth, validate(getMeSchema), asyncHandler(controller.getMe, "获取当前用户失败"));
  router.get(
    "/me/profile",
    auth,
    validate(getMyProfileSchema),
    asyncHandler(controller.getProfile, "获取用户扩展资料失败"),
  );
  router.patch(
    "/me/profile",
    auth,
    validate(patchMyProfileSchema),
    asyncHandler(controller.patchProfile, "更新用户资料失败"),
  );
  return router;
}
