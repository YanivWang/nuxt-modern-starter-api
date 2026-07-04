/**
 * 文件职责：大文件分片上传的 multer 配置。
 * 因 multer destination 是同步回调，目录解析依赖 init 阶段写入的 uploadId -> fileMd5 会话文件。
 */
import multer, { diskStorage } from "multer";

import { partFileName, syncResolveLargeUploadChunkDir } from "./large-upload.service.js";

import type { Request } from "express";

const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

/** 分片上传：字段名 `chunk`，单文件不超过 8MB（须与 init 时 chunkSize 一致且 ≤ 此上限） */
export const largeUploadChunkMulter = multer({
  storage: diskStorage({
    destination(req: Request, _file, cb) {
      const { uploadId } = req.params;
      // multer 的 destination 是同步回调，因此通过 session 文件把 uploadId 映射回 init 时的 fileMd5 目录。
      cb(null, syncResolveLargeUploadChunkDir(uploadId));
    },
    filename(req: Request, _file, cb) {
      const v = req.validated as { params?: { chunkIndex?: number } } | undefined;
      // validate 中间件已把 chunkIndex 转为数字；保留 req.params 兜底给 multer 调用顺序变化时使用。
      const idx = v?.params?.chunkIndex ?? Number(req.params.chunkIndex);
      cb(null, partFileName(idx));
    },
  }),
  limits: { fileSize: MAX_CHUNK_BYTES },
}).single("chunk");
