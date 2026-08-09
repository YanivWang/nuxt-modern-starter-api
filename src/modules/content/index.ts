/** 文件职责：内容模块公开入口，接收 Repository/Revalidator Ports 并返回模块实例。 */
import { createContentController } from "./content.controller.js";
import { createContentRoutes } from "./content.routes.js";
import { createContentService } from "./content.service.js";

import type { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import type { ContentRepository } from "./ports/content-repository.port.js";
import type { ContentRevalidator } from "./ports/content-revalidator.port.js";

export function createContentModule(
  repository: ContentRepository,
  revalidator: ContentRevalidator,
  auth: AuthMiddleware,
) {
  const service = createContentService(repository, revalidator);
  return { routes: createContentRoutes(createContentController(service), auth), service };
}
