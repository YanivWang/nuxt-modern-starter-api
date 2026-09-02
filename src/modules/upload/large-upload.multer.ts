/**
 * 文件职责：配置分片落盘的 multer 实例。
 * destination/filename 是同步回调，只能通过 LargeUploadStorage 的同步方法解析分片目录与分片文件名。
 *
 * destination 同时承担落盘前的归属校验：它是整条链上最后一个「还没写任何字节」的位置。
 *
 * 这两个回调里的异常必须交给 callback，不能直接抛：multer 的同步回调不在它自己的错误链上，
 * 抛出去的错误既到不了 errorMiddleware，也不会结束这次请求 ——
 * 客户端拿不到任何响应、一直挂到自己超时，服务端只留下一条 unhandled error。
 * 而「会话不存在」是断点续传里的正常场景（任务过期或已被清理），必须变成一次干净的 404。
 */
import multer, { diskStorage } from "multer";

import { unauthorized } from "../../shared/errors/app-error.js";

import type { LargeUploadStorage } from "./ports/large-upload-storage.port.js";
import type { Request } from "express";

const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

export function createLargeUploadChunkMiddleware(storage: LargeUploadStorage) {
  return multer({
    storage: diskStorage({
      destination(req: Request, _file, callback) {
        try {
          // 归属校验必须在这一步完成：destination 返回后 multer 立刻建流写盘，
          // 等 controller 再查已经是「别人的分片已被覆写」之后的事后通知了。
          const userId = req.user?.id;
          if (userId == null) throw unauthorized("未登录或无效登录凭证");
          callback(null, storage.resolveChunkDir(req.params.uploadId, userId));
        } catch (error) {
          callback(error as Error, "");
        }
      },
      filename(req: Request, _file, callback) {
        try {
          const validated = req.validated as { params?: { chunkIndex?: number } } | undefined;
          callback(null, storage.partFileName(validated?.params?.chunkIndex ?? Number(req.params.chunkIndex)));
        } catch (error) {
          callback(error as Error, "");
        }
      },
    }),
    limits: { fileSize: MAX_CHUNK_BYTES },
  }).single("chunk");
}
