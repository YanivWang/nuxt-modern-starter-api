/**
 * 文件职责：注册全部上传路由并装配 multer。
 * 所有接口都要求登录；大文件接口先 validate 再交给 multer，保证 uploadId/chunkIndex 在落盘前已被校验。
 */
import express from "express";

import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { createImageUploadMiddlewares } from "./image-upload.config.js";
import { createImageUploadController } from "./image-upload.controller.js";
import { createLargeUploadChunkMiddleware } from "./large-upload.multer.js";
import { createLargeUploadController } from "./large-upload.controller.js";
import {
  largeUploadChunkParamsSchema,
  largeUploadIdParamsSchema,
  largeUploadInitSchema,
} from "./large-upload.schema.js";

import type { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import type { FileStorage } from "./ports/file-storage.port.js";
import type { LargeUploadStorage } from "./ports/large-upload-storage.port.js";

export function createUploadRoutes(auth: AuthMiddleware, files: FileStorage, largeFiles: LargeUploadStorage) {
  const router = express.Router();
  const imageMiddleware = createImageUploadMiddlewares(files);
  const uploadImages = createImageUploadController(files);
  const large = createLargeUploadController(largeFiles);
  const chunkMiddleware = createLargeUploadChunkMiddleware(largeFiles);

  router.post("/uploads", auth, imageMiddleware.common, asyncHandler(uploadImages, "上传失败"));
  router.post("/uploads/profiles", auth, imageMiddleware.profile, asyncHandler(uploadImages, "上传失败"));
  router.post(
    "/uploads/large/init",
    auth,
    validate(largeUploadInitSchema),
    asyncHandler(large.init, "创建上传任务失败"),
  );
  router.get(
    "/uploads/large/:uploadId/status",
    auth,
    validate(largeUploadIdParamsSchema),
    asyncHandler(large.status, "查询状态失败"),
  );
  router.put(
    "/uploads/large/:uploadId/chunks/:chunkIndex",
    auth,
    validate(largeUploadChunkParamsSchema),
    chunkMiddleware,
    asyncHandler(large.chunk, "上传分片失败"),
  );
  router.post(
    "/uploads/large/:uploadId/merge",
    auth,
    validate(largeUploadIdParamsSchema),
    asyncHandler(large.merge, "合并失败"),
  );
  router.delete(
    "/uploads/large/:uploadId",
    auth,
    validate(largeUploadIdParamsSchema),
    asyncHandler(large.abort, "取消上传失败"),
  );
  return router;
}
