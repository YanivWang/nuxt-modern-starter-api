/** 文件职责：用户模块公开入口。 */
import { createUserController } from "./user.controller.js";
import { createUserProfileService } from "./user-profile.service.js";
import { createUserRoutes } from "./user.routes.js";
import { createUserService } from "./user.service.js";

import type { AppDatabase } from "../../db/index.js";
import type { AuthMiddleware } from "../../middlewares/auth.middleware.js";

export function createUserModule(database: AppDatabase, auth: AuthMiddleware) {
  const users = createUserService(database);
  const profiles = createUserProfileService(database);
  return { routes: createUserRoutes(createUserController(users, profiles), auth), users, profiles };
}
