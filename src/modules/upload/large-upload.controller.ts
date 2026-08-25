/**
 * 文件职责：大文件分片上传接口的 HTTP 适配层。
 * 把 init/status/chunk/merge/abort 请求转交 LargeUploadStorage Port，并统一附带当前用户 id 做归属校验。
 */
import { badRequest, unauthorized } from "../../shared/errors/app-error.js";
import { success } from "../../utils/response.js";

import type { LargeUploadInitBody } from "./large-upload.schema.js";
import type { LargeUploadStorage } from "./ports/large-upload-storage.port.js";
import type { Request, Response } from "express";

function currentUserId(req: Request) {
  const id = req.user?.id;
  if (id == null) throw unauthorized("未登录或无效登录凭证");
  return id;
}

export function createLargeUploadController(storage: LargeUploadStorage) {
  return {
    init: async (req: Request, res: Response) => {
      const data = await storage.init((req.validated as { body: LargeUploadInitBody }).body, currentUserId(req));
      return success(res, data.instant ? "文件已存在，秒传完成" : "已创建上传任务", data);
    },
    status: async (req: Request, res: Response) => {
      const { uploadId } = (req.validated as { params: { uploadId: string } }).params;
      return success(res, "ok", await storage.getStatus(uploadId, currentUserId(req)));
    },
    chunk: async (req: Request, res: Response) => {
      const validated = req.validated as {
        params: { uploadId: string; chunkIndex: number };
        headers: { "x-chunk-md5": string };
      };
      if (!req.file?.path) throw badRequest("请选择分片文件（表单字段名 chunk）");
      await storage.finalizeChunk(
        validated.params.uploadId,
        validated.params.chunkIndex,
        currentUserId(req),
        req.file.path,
        validated.headers["x-chunk-md5"],
      );
      return success(res, "分片已接收", { chunkIndex: validated.params.chunkIndex });
    },
    merge: async (req: Request, res: Response) => {
      const { uploadId } = (req.validated as { params: { uploadId: string } }).params;
      const data = await storage.merge(uploadId, currentUserId(req));
      return success(res, data.merged ? "合并完成" : "任务已完成", data);
    },
    abort: async (req: Request, res: Response) => {
      const { uploadId } = (req.validated as { params: { uploadId: string } }).params;
      await storage.abort(uploadId, currentUserId(req));
      return success(res, "已取消", {});
    },
  };
}

export type LargeUploadController = ReturnType<typeof createLargeUploadController>;
