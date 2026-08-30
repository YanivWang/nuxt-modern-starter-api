/** 文件职责：认证模块公开入口，组装认证 Service、Controller、Router 和中间件。 */
import { createAuthMiddleware } from "../../middlewares/auth.middleware.js";
import { createOptionalAuthMiddleware } from "../../middlewares/optionalAuth.middleware.js";
import { createAuthController } from "./auth.controller.js";
import { createAuthRoutes } from "./auth.routes.js";
import { createAuthSessionService } from "./auth-session.service.js";
import { createAuthService } from "./auth.service.js";
import { createJwtVerifier } from "./jwt-verify.service.js";

import type { AppDatabase } from "../../db/index.js";
import type { LoginAttemptTracker } from "./ports/login-attempt-tracker.port.js";
import type { TokenBlacklist } from "./ports/token-blacklist.port.js";
import type { RequestHandler } from "express";

export function createAuthModule(
  database: AppDatabase,
  blacklist: TokenBlacklist,
  loginAttempts: LoginAttemptTracker,
  authRateLimit: RequestHandler,
) {
  const verifier = createJwtVerifier(blacklist);
  const authMiddleware = createAuthMiddleware(verifier);
  // 登出专用：签名必须有效，但允许 access token 已过期。
  const logoutAuthMiddleware = createAuthMiddleware(verifier, { allowExpired: true });
  const optionalAuthMiddleware = createOptionalAuthMiddleware(verifier);
  const sessions = createAuthSessionService(database);
  const service = createAuthService(database, sessions, loginAttempts);
  const controller = createAuthController(service, sessions, blacklist);

  return {
    routes: createAuthRoutes(controller, logoutAuthMiddleware, authRateLimit),
    authMiddleware,
    optionalAuthMiddleware,
    sessions,
  };
}

export type AuthModule = ReturnType<typeof createAuthModule>;
