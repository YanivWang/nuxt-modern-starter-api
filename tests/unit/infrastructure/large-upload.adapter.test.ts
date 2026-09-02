/**
 * 文件职责：直接驱动本地分片上传 adapter，覆盖它落在磁盘上的那部分行为。
 *
 * 这个 adapter 此前只被集成测试间接覆盖，而集成测试要 MySQL + Redis 才能跑，
 * 于是「分片落盘的顺序、被拒绝时删不删文件、暂存目录在不在公开静态根里」
 * 这类只跟文件系统有关的行为实际上长期没有任何守门人。
 * 它不依赖数据库，本来就该在单元层被钉住。
 */
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { localFileStorage } from "../../../src/infrastructure/storage/local-file-storage.adapter.js";
import {
  LARGE_UPLOAD_CHUNKS_ROOT,
  abortLargeUpload,
  finalizeChunkWrite,
  initLargeUpload,
  mergeLargeUpload,
  partFileName,
  syncResolveLargeUploadChunkDir,
} from "../../../src/infrastructure/storage/local-large-upload.adapter.js";
import { projectRoot } from "../../../src/utils/projectRoot.js";

import type { AppError } from "../../../src/shared/errors/app-error.js";

const OWNER = 4001;
const INTRUDER = 4002;
const CHUNK_SIZE = 1024 * 1024;

const md5 = (buffer: Buffer) => createHash("md5").update(buffer).digest("hex");

/** 本文件产生的所有落盘路径，afterEach 逐个清掉。 */
const created: string[] = [];

/** 每个用例用随机内容，避免同一 MD5 命中上一轮留下的秒传索引而走不到分片流程。 */
async function newUpload(chunkTotal = 1) {
  const content = randomBytes(CHUNK_SIZE);
  const fileMd5 = md5(content);
  const result = await initLargeUpload(
    { fileName: "adapter.bin", fileSize: CHUNK_SIZE * chunkTotal, chunkSize: CHUNK_SIZE, fileMd5 },
    OWNER,
  );
  if (result.instant) throw new Error("秒传索引意外命中，用例无法覆盖分片流程");

  created.push(
    path.join(LARGE_UPLOAD_CHUNKS_ROOT, fileMd5),
    path.join(projectRoot, ".data", "large-upload-sessions", `${result.uploadId}.json`),
    path.join(projectRoot, ".data", "large-upload-done", `${result.uploadId}.json`),
    path.join(projectRoot, ".data", "large-upload-hash-index", `${fileMd5}.json`),
  );

  return { uploadId: result.uploadId, fileMd5, content };
}

/** 模拟 multer：先拿目录（此处会做归属校验），再把分片写进去。 */
async function putChunk(uploadId: string, index: number, userId: number, content: Buffer) {
  const dir = syncResolveLargeUploadChunkDir(uploadId, userId);
  const saved = path.join(dir, partFileName(index));
  await fs.writeFile(saved, content);
  await finalizeChunkWrite(uploadId, index, userId, saved, md5(content));
  return saved;
}

const exists = (target: string) =>
  fs
    .stat(target)
    .then(() => true)
    .catch(() => false);

async function patchMeta(fileMd5: string, uploadId: string, patch: Record<string, unknown>) {
  const file = path.join(LARGE_UPLOAD_CHUNKS_ROOT, fileMd5, uploadId, "meta.json");
  const meta = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
  await fs.writeFile(file, JSON.stringify({ ...meta, ...patch }), "utf8");
}

const codeOf = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return (error as AppError).code;
  }
  return "NO_ERROR";
};

describe("local large upload adapter", () => {
  afterEach(async () => {
    for (const target of created.splice(0)) {
      await fs.rm(target, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("keeps the chunk staging area out of the publicly served uploads root", () => {
    // uploads/ 整个目录由 express.static 无鉴权地挂在 /uploads 下；
    // 暂存目录一旦落在里面，未合并的分片和含 userId 的 meta.json 就都能被匿名下载。
    const relative = path.relative(localFileStorage.root, LARGE_UPLOAD_CHUNKS_ROOT);
    expect(relative.startsWith("..") || path.isAbsolute(relative)).toBe(true);
  });

  it("refuses to hand a chunk directory to anyone but the owner", async () => {
    const { uploadId, content } = await newUpload();
    const dir = syncResolveLargeUploadChunkDir(uploadId, OWNER);
    await fs.writeFile(path.join(dir, partFileName(0)), content);

    // 关键点是这一步就抛：multer 拿到目录后立刻建流写盘，放行等于让别人覆写受害者的分片。
    expect(() => syncResolveLargeUploadChunkDir(uploadId, INTRUDER)).toThrowError(/无权访问/);

    const stored = await fs.readFile(path.join(dir, partFileName(0)));
    expect(stored.equals(content)).toBe(true);
  });

  it("reports an unknown uploadId as not-found instead of resolving a directory", async () => {
    expect(() => syncResolveLargeUploadChunkDir("00000000-0000-4000-8000-000000000000", OWNER)).toThrowError(
      /不存在|失效/,
    );
  });

  it("deletes the staged file on every rejection, not only on checksum mismatch", async () => {
    const { uploadId, content } = await newUpload();
    const dir = syncResolveLargeUploadChunkDir(uploadId, OWNER);

    // 大小不符：原本就会清理
    const wrongSize = path.join(dir, partFileName(0));
    await fs.writeFile(wrongSize, content.subarray(0, 10));
    expect(await codeOf(() => finalizeChunkWrite(uploadId, 0, OWNER, wrongSize, md5(content.subarray(0, 10))))).toBe(
      "BAD_REQUEST",
    );
    expect(await exists(wrongSize)).toBe(false);

    // 归属不符：这条路径以前只抛错、不删文件，留下的分片会被后续 status/merge 读到
    const foreign = path.join(dir, partFileName(0));
    await fs.writeFile(foreign, content);
    expect(await codeOf(() => finalizeChunkWrite(uploadId, 0, INTRUDER, foreign, md5(content)))).toBe("FORBIDDEN");
    expect(await exists(foreign)).toBe(false);

    // 下标越界：同样必须清理
    const outOfRange = path.join(dir, partFileName(5));
    await fs.writeFile(outOfRange, content);
    expect(await codeOf(() => finalizeChunkWrite(uploadId, 5, OWNER, outOfRange, md5(content)))).toBe("BAD_REQUEST");
    expect(await exists(outOfRange)).toBe(false);
  });

  it("merges a complete upload and publishes it under the uploads root", async () => {
    const { uploadId, content } = await newUpload();
    await putChunk(uploadId, 0, OWNER, content);

    const merged = await mergeLargeUpload(uploadId, OWNER);
    expect(merged.merged).toBe(true);
    expect(merged.url.startsWith("/uploads/large/")).toBe(true);

    const finalAbs = path.join(localFileStorage.root, merged.url.replace(/^\/uploads\//, ""));
    created.push(finalAbs);
    expect(md5(await fs.readFile(finalAbs))).toBe(md5(content));

    // 重复 merge 是客户端重试的正常路径，必须幂等
    expect(await mergeLargeUpload(uploadId, OWNER)).toEqual({ url: merged.url, merged: false });
  });

  it("keeps the precise reason when a part is present but the wrong size", async () => {
    const { uploadId, fileMd5, content } = await newUpload(2);
    const dir = syncResolveLargeUploadChunkDir(uploadId, OWNER);
    await fs.writeFile(path.join(dir, partFileName(0)), content);
    // 第 1 片存在但大小不对：这条 409 的文案曾被 catch 里失效的守卫统一改写成「未就绪」
    await fs.writeFile(path.join(dir, partFileName(1)), content.subarray(0, 32));

    await expect(mergeLargeUpload(uploadId, OWNER)).rejects.toThrowError(/缺失或大小不正确/);
    expect(fileMd5).toHaveLength(32);
  });

  it("lets a merge retry through once the merging lock has been abandoned", async () => {
    const { uploadId, fileMd5, content } = await newUpload();
    await putChunk(uploadId, 0, OWNER, content);

    // 持锁进程被杀掉后磁盘上留下的就是这个状态
    await patchMeta(fileMd5, uploadId, { status: "merging", mergingStartedAt: new Date().toISOString() });
    expect(await codeOf(() => mergeLargeUpload(uploadId, OWNER))).toBe("CONFLICT");

    await patchMeta(fileMd5, uploadId, {
      status: "merging",
      mergingStartedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const merged = await mergeLargeUpload(uploadId, OWNER);
    created.push(path.join(localFileStorage.root, merged.url.replace(/^\/uploads\//, "")));
    expect(merged.merged).toBe(true);
  });

  it("treats a task older than the retention window as gone", async () => {
    const { uploadId, fileMd5 } = await newUpload();
    await patchMeta(fileMd5, uploadId, { createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() });

    expect(() => syncResolveLargeUploadChunkDir(uploadId, OWNER)).toThrowError(/已过期/);
    expect(await codeOf(() => mergeLargeUpload(uploadId, OWNER))).toBe("GONE");
  });

  it("cleans up chunks and the session when a task is aborted", async () => {
    const { uploadId, fileMd5, content } = await newUpload();
    await putChunk(uploadId, 0, OWNER, content);

    await abortLargeUpload(uploadId, OWNER);

    expect(await exists(path.join(LARGE_UPLOAD_CHUNKS_ROOT, fileMd5, uploadId))).toBe(false);
    expect(await exists(path.join(projectRoot, ".data", "large-upload-sessions", `${uploadId}.json`))).toBe(false);
  });
});
