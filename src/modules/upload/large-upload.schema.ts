import { z } from "zod";

import { LARGE_UPLOAD_MAX_FILE_BYTES } from "./largeUpload.js";

const MIN_CHUNK_BYTES = 1024 * 1024;
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_LARGE_UPLOAD_CHUNKS = 2000;

const uploadIdParam = z.uuid({ error: "uploadId 须为有效 UUID" });

const fileMd5Schema = z
  .string()
  .trim()
  .length(32, "fileMd5 须为 32 位十六进制")
  .regex(/^[a-fA-F0-9]{32}$/, "fileMd5 须为 32 位十六进制")
  .transform((s) => s.toLowerCase());

export const largeUploadInitSchema = z.object({
  body: z
    .object({
      fileName: z.string().trim().min(1, "fileName 不能为空").max(255, "fileName 过长"),
      fileSize: z
        .number({ error: "fileSize 须为整数" })
        .int("fileSize 须为整数")
        .positive("fileSize 须为正数")
        .max(LARGE_UPLOAD_MAX_FILE_BYTES, `单文件不超过 ${LARGE_UPLOAD_MAX_FILE_BYTES / 1024 / 1024}MB`),
      chunkSize: z
        .number({ error: "chunkSize 须为整数" })
        .int("chunkSize 须为整数")
        .min(MIN_CHUNK_BYTES, `分片不小于 ${MIN_CHUNK_BYTES / 1024 / 1024}MB`)
        .max(MAX_CHUNK_BYTES, `分片不大于 ${MAX_CHUNK_BYTES / 1024 / 1024}MB`),
      mimeType: z.string().trim().max(128, "mimeType 过长").optional(),
      fileMd5: fileMd5Schema,
    })
    .refine((b) => b.fileSize >= b.chunkSize || Math.ceil(b.fileSize / b.chunkSize) === 1, {
      message: "fileSize 与 chunkSize 组合无效",
    })
    .refine(
      (b) => {
        const total = Math.ceil(b.fileSize / b.chunkSize);
        return total >= 1 && total <= MAX_LARGE_UPLOAD_CHUNKS;
      },
      {
        message: `分片总数须在 1～${MAX_LARGE_UPLOAD_CHUNKS} 之间`,
      },
    ),
});

export const largeUploadIdParamsSchema = z.object({
  params: z.object({
    uploadId: uploadIdParam,
  }),
});

/** Express 将请求头 key 规范为小写；值为 `string | string[] | undefined` */
const xChunkMd5HeaderSchema = z.preprocess((val: unknown): unknown => {
  if (val == null) return val;
  if (Array.isArray(val)) return val[0] as unknown;
  return val;
}, fileMd5Schema);

export const largeUploadChunkParamsSchema = z.object({
  params: z.object({
    uploadId: uploadIdParam,
    chunkIndex: z.coerce
      .number({ error: "chunkIndex 须为整数" })
      .int("chunkIndex 须为整数")
      .min(0, "chunkIndex 不能为负")
      .max(MAX_LARGE_UPLOAD_CHUNKS - 1, "chunkIndex 过大"),
  }),
  headers: z.object({
    "x-chunk-md5": xChunkMd5HeaderSchema,
  }),
});

export type LargeUploadInitBody = z.infer<typeof largeUploadInitSchema>["body"];
