import express from "express";

import { login, logout, refresh, register } from "../controllers/auth.controller.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { authRateLimitMiddleware } from "../middlewares/rateLimit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from "../schema/auth.schema.js";

const router = express.Router();

router.post("/register", authRateLimitMiddleware, validate(registerSchema), asyncHandler(register, "注册失败"));

router.post("/login", authRateLimitMiddleware, validate(loginSchema), asyncHandler(login, "登录失败"));

router.post("/refresh", authRateLimitMiddleware, validate(refreshSchema), asyncHandler(refresh, "刷新登录失败"));

router.post("/logout", authMiddleware, validate(logoutSchema), asyncHandler(logout, "退出登录失败"));

export default router;
