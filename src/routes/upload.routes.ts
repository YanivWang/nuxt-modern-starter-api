import express from "express";

import { largeUploadChunkMulter } from "../config/large-upload.multer.js";
import { uploadImagesMiddleware, uploadProfileImagesMiddleware } from "../config/upload.config.js";
import {
  deleteLargeUpload,
  getLargeUploadStatusHandler,
  postLargeUploadInit,
  postLargeUploadMerge,
  putLargeUploadChunk,
} from "../controllers/large-upload.controller.js";
import { uploadImages } from "../controllers/upload.controller.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  largeUploadChunkParamsSchema,
  largeUploadIdParamsSchema,
  largeUploadInitSchema,
} from "../schema/large-upload.schema.js";

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
