import multer, { diskStorage } from "multer";

import { partFileName, syncResolveLargeUploadChunkDir } from "../services/large-upload.service.js";

import type { Request } from "express";

const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

/** 分片上传：字段名 `chunk`，单文件不超过 8MB（须与 init 时 chunkSize 一致且 ≤ 此上限） */
export const largeUploadChunkMulter = multer({
  storage: diskStorage({
    destination(req: Request, _file, cb) {
      const { uploadId } = req.params;
      cb(null, syncResolveLargeUploadChunkDir(uploadId));
    },
    filename(req: Request, _file, cb) {
      const v = req.validated as { params?: { chunkIndex?: number } } | undefined;
      const idx = v?.params?.chunkIndex ?? Number(req.params.chunkIndex);
      cb(null, partFileName(idx));
    },
  }),
  limits: { fileSize: MAX_CHUNK_BYTES },
}).single("chunk");
