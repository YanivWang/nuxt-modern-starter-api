/**
 * 文件职责：注册文档 HTTP 路由。
 */
import express from "express";

import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { getDocument, patchDocument } from "./document.controller.js";
import { documentIdParamsSchema, patchDocumentSchema } from "./document.schema.js";

const router = express.Router();

router.get(
  "/documents/:documentId",
  authMiddleware,
  validate(documentIdParamsSchema),
  asyncHandler(getDocument, "获取文档失败"),
);
router.patch(
  "/documents/:documentId",
  authMiddleware,
  validate(patchDocumentSchema),
  asyncHandler(patchDocument, "保存文档失败"),
);

export default router;
