/**
 * 文件职责：配置分片落盘的 multer 实例。
 * destination/filename 是同步回调，只能通过 LargeUploadStorage 的同步方法解析分片目录与分片文件名。
 */
import multer, { diskStorage } from "multer";

import type { LargeUploadStorage } from "./ports/large-upload-storage.port.js";
import type { Request } from "express";

const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

export function createLargeUploadChunkMiddleware(storage: LargeUploadStorage) {
  return multer({
    storage: diskStorage({
      destination(req: Request, _file, callback) {
        callback(null, storage.resolveChunkDir(req.params.uploadId));
      },
      filename(req: Request, _file, callback) {
        const validated = req.validated as { params?: { chunkIndex?: number } } | undefined;
        callback(null, storage.partFileName(validated?.params?.chunkIndex ?? Number(req.params.chunkIndex)));
      },
    }),
    limits: { fileSize: MAX_CHUNK_BYTES },
  }).single("chunk");
}
