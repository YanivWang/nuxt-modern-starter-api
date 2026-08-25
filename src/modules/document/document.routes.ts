/** 文件职责：注册文档路由 GET/PATCH /documents/:documentId，全部要求登录。 */
import express from "express";

import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { documentIdParamsSchema, patchDocumentSchema } from "./document.schema.js";

import type { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import type { DocumentController } from "./document.controller.js";

export function createDocumentRoutes(controller: DocumentController, auth: AuthMiddleware) {
  const router = express.Router();
  router.get(
    "/documents/:documentId",
    auth,
    validate(documentIdParamsSchema),
    asyncHandler(controller.get, "获取文档失败"),
  );
  router.patch(
    "/documents/:documentId",
    auth,
    validate(patchDocumentSchema),
    asyncHandler(controller.patch, "保存文档失败"),
  );
  return router;
}
