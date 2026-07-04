import { createHttpError } from "../middlewares/error.middleware.js";
import {
  abortLargeUpload,
  finalizeChunkWrite,
  getLargeUploadStatus,
  initLargeUpload,
  mergeLargeUpload,
} from "../services/large-upload.service.js";
import { success } from "../utils/response.js";

import type { LargeUploadInitBody } from "../schema/large-upload.schema.js";
import type { Request, Response } from "express";

export async function postLargeUploadInit(req: Request, res: Response) {
  const userId = req.user?.id;
  if (userId == null) {
    throw createHttpError(401, "未登录或无效登录凭证");
  }
  const body = (req.validated as { body: LargeUploadInitBody }).body;
  const data = await initLargeUpload(body, userId);
  if (data.instant) {
    return success(res, "文件已存在，秒传完成", {
      instant: true,
      publicUrl: data.publicUrl,
      chunkTotal: data.chunkTotal,
      expiresAt: data.expiresAt,
    });
  }
  return success(res, "已创建上传任务", {
    instant: false,
    uploadId: data.uploadId,
    chunkTotal: data.chunkTotal,
    expiresAt: data.expiresAt,
  });
}

export async function getLargeUploadStatusHandler(req: Request, res: Response) {
  const userId = req.user?.id;
  if (userId == null) {
    throw createHttpError(401, "未登录或无效登录凭证");
  }
  const { uploadId } = (req.validated as { params: { uploadId: string } }).params;
  const data = await getLargeUploadStatus(uploadId, userId);
  return success(res, "ok", data);
}

export async function putLargeUploadChunk(req: Request, res: Response) {
  const userId = req.user?.id;
  if (userId == null) {
    throw createHttpError(401, "未登录或无效登录凭证");
  }
  const validated = req.validated as {
    params: { uploadId: string; chunkIndex: number };
    headers: { "x-chunk-md5": string };
  };
  const { uploadId, chunkIndex } = validated.params;
  const chunkMd5 = validated.headers["x-chunk-md5"];
  const file = req.file;
  if (!file?.path) {
    throw createHttpError(400, "请选择分片文件（表单字段名 chunk）");
  }
  await finalizeChunkWrite(uploadId, chunkIndex, userId, file.path, chunkMd5);
  return success(res, "分片已接收", { chunkIndex });
}

export async function postLargeUploadMerge(req: Request, res: Response) {
  const userId = req.user?.id;
  if (userId == null) {
    throw createHttpError(401, "未登录或无效登录凭证");
  }
  const { uploadId } = (req.validated as { params: { uploadId: string } }).params;
  const data = await mergeLargeUpload(uploadId, userId);
  return success(res, data.merged ? "合并完成" : "任务已完成", {
    url: data.url,
    merged: data.merged,
  });
}

export async function deleteLargeUpload(req: Request, res: Response) {
  const userId = req.user?.id;
  if (userId == null) {
    throw createHttpError(401, "未登录或无效登录凭证");
  }
  const { uploadId } = (req.validated as { params: { uploadId: string } }).params;
  await abortLargeUpload(uploadId, userId);
  return success(res, "已取消", {});
}
