/**
 * 文件职责：注册认证路由 /register、/login、/refresh、/logout。
 * 前三个挂 authRateLimitMiddleware 降低撞库与刷 token 风险；logout 需先经认证中间件才能拿到 jti。
 * logout 使用允许 token 过期的认证中间件：登录态过期后用户仍必须能撤销自己的 refresh token 会话。
 */
import express from "express";

import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from "./auth.schema.js";

import type { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import type { RequestHandler } from "express";
import type { AuthController } from "./auth.controller.js";

export function createAuthRoutes(
  controller: AuthController,
  logoutAuthMiddleware: AuthMiddleware,
  authRateLimitMiddleware: RequestHandler,
) {
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
  router.post("/logout", logoutAuthMiddleware, validate(logoutSchema), asyncHandler(controller.logout, "退出登录失败"));
  return router;
}
