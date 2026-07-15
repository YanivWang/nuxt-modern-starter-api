/**
 * 文件职责：注册普通上传和大文件分片上传路由。
 * 所有上传接口都要求登录；multipart 文件先由 multer 写盘，再进入 controller/service 做业务校验。
 */
import express from "express";

import { largeUploadChunkMulter } from "./large-upload.multer.js";
import { uploadImagesMiddleware, uploadProfileImagesMiddleware } from "./image-upload.config.js";
import {
  deleteLargeUpload,
  getLargeUploadStatusHandler,
  postLargeUploadInit,
  postLargeUploadMerge,
  putLargeUploadChunk,
} from "./large-upload.controller.js";
import { uploadImages } from "./image-upload.controller.js";
import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
  largeUploadChunkParamsSchema,
  largeUploadIdParamsSchema,
  largeUploadInitSchema,
} from "./large-upload.schema.js";

const router = express.Router();

router.post("/uploads", authMiddleware, uploadImagesMiddleware, asyncHandler(uploadImages, "上传失败"));

router.post("/uploads/profiles", authMiddleware, uploadProfileImagesMiddleware, asyncHandler(uploadImages, "上传失败"));

router.post(
  "/uploads/large/init",
  authMiddleware,
  validate(largeUploadInitSchema),
  asyncHandler(postLargeUploadInit, "创建上传任务失败"),
);

router.get(
  "/uploads/large/:uploadId/status",
  authMiddleware,
  validate(largeUploadIdParamsSchema),
  asyncHandler(getLargeUploadStatusHandler, "查询状态失败"),
);

router.put(
  "/uploads/large/:uploadId/chunks/:chunkIndex",
  authMiddleware,
  validate(largeUploadChunkParamsSchema),
  largeUploadChunkMulter,
  asyncHandler(putLargeUploadChunk, "上传分片失败"),
);

router.post(
  "/uploads/large/:uploadId/merge",
  authMiddleware,
  validate(largeUploadIdParamsSchema),
  asyncHandler(postLargeUploadMerge, "合并失败"),
);

router.delete(
  "/uploads/large/:uploadId",
  authMiddleware,
  validate(largeUploadIdParamsSchema),
  asyncHandler(deleteLargeUpload, "取消上传失败"),
);

export default router;
