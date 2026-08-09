import express from "express";

import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { authRateLimitMiddleware } from "../../middlewares/rateLimit.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from "./auth.schema.js";

import type { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import type { AuthController } from "./auth.controller.js";

export function createAuthRoutes(controller: AuthController, authMiddleware: AuthMiddleware) {
  const router = express.Router();
  router.post(
    "/register",
    authRateLimitMiddleware,
    validate(registerSchema),
    asyncHandler(controller.register, "注册失败"),
  );
  router.post("/login", authRateLimitMiddleware, validate(loginSchema), asyncHandler(controller.login, "登录失败"));
  router.post(
    "/refresh",
    authRateLimitMiddleware,
    validate(refreshSchema),
    asyncHandler(controller.refresh, "刷新登录失败"),
  );
  router.post("/logout", authMiddleware, validate(logoutSchema), asyncHandler(controller.logout, "退出登录失败"));
  return router;
}
