/**
 * 文件职责：声明分片上传会话、分片写入、合并和取消能力。
 *
 * 返回类型统一由 upload.contract.ts 的响应 schema 推导：
 * Port 自己再抄一份类型，就会出现「Adapter 多返回几个字段、Port 没声明、文档也没写」的三方不一致。
 */
import type { LargeUploadInitBody } from "../large-upload.schema.js";
import type { InitLargeUploadResult, LargeUploadMergeResult, LargeUploadStatus } from "../upload.contract.js";

export type { InitLargeUploadResult, LargeUploadMergeResult, LargeUploadStatus } from "../upload.contract.js";

export interface LargeUploadStorage {
  /**
   * 解析分片落盘目录，并在返回之前完成归属校验。
   * 校验必须发生在这里而不是 controller：调用方（multer 的同步 destination 回调）
   * 一拿到路径就开始写盘，之后再拒绝已经来不及。
   */
  resolveChunkDir(uploadId: string, userId: number): string;
  partFileName(chunkIndex: number): string;
  init(body: LargeUploadInitBody, userId: number): Promise<InitLargeUploadResult>;
  getStatus(uploadId: string, userId: number): Promise<LargeUploadStatus>;
  finalizeChunk(
    uploadId: string,
    chunkIndex: number,
    userId: number,
    savedPath: string,
    chunkMd5: string,
  ): Promise<void>;
  merge(uploadId: string, userId: number): Promise<LargeUploadMergeResult>;
  abort(uploadId: string, userId: number): Promise<void>;
  /**
   * 清理超过保留期的临时分片与会话文件。
   * 客户端中途掉线不会触发 abort，这些分片若无人清理会永久占用磁盘。
   */
  purgeStale(
    retentionHours: number,
  ): Promise<{ removedUploads: number; removedSessions: number; removedMarkers: number }>;
}
