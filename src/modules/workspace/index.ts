/** 文件职责：工作区模块公开入口。 */
import { createWorkspaceController } from "./workspace.controller.js";
import { createWorkspaceRoutes } from "./workspace.routes.js";
import { createWorkspaceService } from "./workspace.service.js";

import type { AppDatabase } from "../../db/index.js";
import type { AuthMiddleware } from "../../middlewares/auth.middleware.js";

export { type ProjectDto } from "./workspace.service.js";

export function createWorkspaceModule(database: AppDatabase, auth: AuthMiddleware) {
  const service = createWorkspaceService(database);
  return { routes: createWorkspaceRoutes(createWorkspaceController(service), auth), service };
}
