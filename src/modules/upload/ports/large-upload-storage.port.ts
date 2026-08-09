/** 文件职责：声明分片上传会话、分片写入、合并和取消能力。 */
import type { LargeUploadInitBody } from "../large-upload.schema.js";

export type InitLargeUploadResult =
  | { instant: true; publicUrl: string; chunkTotal: 0; expiresAt: string }
  | { instant: false; uploadId: string; chunkTotal: number; expiresAt: string };

export type LargeUploadStatus = {
  status: "uploading" | "merging" | "done" | "failed";
  chunkTotal: number;
  receivedIndices: number[];
  publicUrl?: string;
};

export interface LargeUploadStorage {
  resolveChunkDir(uploadId: string): string;
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
  merge(uploadId: string, userId: number): Promise<{ url: string; merged: boolean }>;
  abort(uploadId: string, userId: number): Promise<void>;
}
