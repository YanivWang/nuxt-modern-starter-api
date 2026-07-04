import express from "express";

import { getMe, getMyProfile, patchMyProfile } from "../controllers/user.controller.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { getMyProfileSchema, patchMyProfileSchema } from "../schema/user-profile.schema.js";
import { getMeSchema } from "../schema/user.schema.js";

const router = express.Router();

router.get("/me", authMiddleware, validate(getMeSchema), asyncHandler(getMe, "获取当前用户失败"));

router.get(
  "/me/profile",
  authMiddleware,
  validate(getMyProfileSchema),
  asyncHandler(getMyProfile, "获取用户扩展资料失败"),
);
router.patch(
  "/me/profile",
  authMiddleware,
  validate(patchMyProfileSchema),
  asyncHandler(patchMyProfile, "更新用户资料失败"),
);

export default router;
