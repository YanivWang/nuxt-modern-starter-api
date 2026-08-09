/** 文件职责：文档模块公开入口。 */
import { createDocumentController } from "./document.controller.js";
import { createDocumentRoutes } from "./document.routes.js";
import { createDocumentService } from "./document.service.js";

import type { AppDatabase } from "../../db/index.js";
import type { AuthMiddleware } from "../../middlewares/auth.middleware.js";

export { toDocumentDto, type DocumentDto } from "./document.contract.js";

export function createDocumentModule(database: AppDatabase, auth: AuthMiddleware) {
  const service = createDocumentService(database);
  return { routes: createDocumentRoutes(createDocumentController(service), auth), service };
}
