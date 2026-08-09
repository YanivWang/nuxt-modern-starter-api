/** 文件职责：认证模块公开入口，组装认证 Service、Controller、Router 和中间件。 */
import { createAuthMiddleware } from "../../middlewares/auth.middleware.js";
import { createOptionalAuthMiddleware } from "../../middlewares/optionalAuth.middleware.js";
import { createAuthController } from "./auth.controller.js";
import { createAuthRoutes } from "./auth.routes.js";
import { createAuthSessionService } from "./auth-session.service.js";
import { createAuthService } from "./auth.service.js";
import { createJwtVerifier } from "./jwt-verify.service.js";

import type { AppDatabase } from "../../db/index.js";
import type { TokenBlacklist } from "./ports/token-blacklist.port.js";

export function createAuthModule(database: AppDatabase, blacklist: TokenBlacklist) {
  const verifier = createJwtVerifier(blacklist);
  const authMiddleware = createAuthMiddleware(verifier);
  const optionalAuthMiddleware = createOptionalAuthMiddleware(verifier);
  const sessions = createAuthSessionService(database);
  const service = createAuthService(database, sessions);
  const controller = createAuthController(service, sessions, blacklist);

  return {
    routes: createAuthRoutes(controller, authMiddleware),
    authMiddleware,
    optionalAuthMiddleware,
  };
}

export type AuthModule = ReturnType<typeof createAuthModule>;
