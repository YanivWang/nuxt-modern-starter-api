/**
 * 文件职责：实现本地磁盘大文件分片上传。
 * 维护 init/status/chunk/merge/abort 流程，以及 .data 中的会话、完成标记和全局 MD5 秒传索引。
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fsSync, { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";

import { localFileStorage } from "./local-file-storage.adapter.js";
import { badRequest, conflict, forbidden, gone, internalError, notFound } from "../../shared/errors/app-error.js";
import { projectRoot } from "../../utils/projectRoot.js";

import type { LargeUploadInitBody } from "../../modules/upload/large-upload.schema.js";
import type {
  InitLargeUploadResult,
  LargeUploadStorage,
} from "../../modules/upload/ports/large-upload-storage.port.js";

const uploadsRoot = localFileStorage.root;

/** 临时分片目录（相对 uploadsRoot） */
export const LARGE_CHUNKS_TEMP_SEGMENT = "chunks-temp";

/** 合并后落盘子目录（与静态 /uploads/... 对齐） */
export const LARGE_FINAL_SEGMENT = "large";

const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const FILE_MD5_RE = /^[a-f0-9]{32}$/;

// done marker 独立于分片目录：合并完成并清理临时目录后，重复查询/合并仍能返回已完成结果。
function doneMarkerPath(uploadId: string): string {
  return path.join(projectRoot, ".data", "large-upload-done", `${uploadId}.json`);
}

// session 只保存 uploadId → fileMd5 映射，供 multer 的同步 destination 回调定位分片目录。
function sessionsDir(): string {
  return path.join(projectRoot, ".data", "large-upload-sessions");
}

function sessionPath(uploadId: string): string {
  return path.join(sessionsDir(), `${uploadId}.json`);
}

function normalizeFileMd5(md5: string): string {
  const lower = md5.toLowerCase();
  if (!FILE_MD5_RE.test(lower)) {
    throw badRequest("fileMd5 须为 32 位十六进制");
  }
  return lower;
}

function readSessionFileMd5(uploadId: string): string {
  let raw: string;
  try {
    raw = fsSync.readFileSync(sessionPath(uploadId), "utf8");
  } catch {
    throw notFound("上传任务不存在或会话已失效");
  }
  const j = JSON.parse(raw) as { fileMd5?: string };
  if (typeof j.fileMd5 !== "string") {
    throw internalError("上传会话损坏");
  }
  return normalizeFileMd5(j.fileMd5);
}

/** Multer `destination` 同步回调：分片目录 `chunks-temp/<fileMd5>/<uploadId>/` */
export function syncResolveLargeUploadChunkDir(uploadId: string): string {
  const fileMd5 = readSessionFileMd5(uploadId);
  return path.join(uploadsRoot, LARGE_CHUNKS_TEMP_SEGMENT, fileMd5, uploadId);
}

function hashIndexDir(): string {
  return path.join(projectRoot, ".data", "large-upload-hash-index");
}

function hashIndexPath(md5: string): string {
  return path.join(hashIndexDir(), `${md5}.json`);
}

type GlobalHashRecord = {
  fileSize: number;
  url: string;
  mergedAt: string;
  firstUploaderUserId?: number;
};

export type LargeUploadMeta = {
  fileName: string;
  fileSize: number;
  chunkSize: number;
  chunkTotal: number;
  mimeType?: string;
  fileMd5: string;
  userId: number;
  createdAt: string;
  status: "uploading" | "merging" | "done" | "failed";
  publicUrl?: string;
};

function tempBaseDir(fileMd5: string, uploadId: string): string {
  // fileMd5 参与目录分层，便于同一内容的临时任务聚集，也避免 uploadId 单层目录过大。
  return path.join(uploadsRoot, LARGE_CHUNKS_TEMP_SEGMENT, fileMd5, uploadId);
}

async function readSession(uploadId: string): Promise<{ fileMd5: string } | null> {
  try {
    const raw = await fs.readFile(sessionPath(uploadId), "utf8");
    const j = JSON.parse(raw) as { fileMd5?: string };
    if (typeof j.fileMd5 !== "string") return null;
    return { fileMd5: normalizeFileMd5(j.fileMd5) };
  } catch {
    return null;
  }
}

async function writeSession(uploadId: string, fileMd5: string): Promise<void> {
  await fs.mkdir(sessionsDir(), { recursive: true });
  await fs.writeFile(sessionPath(uploadId), JSON.stringify({ fileMd5 }), "utf8");
}

async function deleteSession(uploadId: string): Promise<void> {
  await fs.unlink(sessionPath(uploadId)).catch(() => {});
}

async function resolveTempDir(uploadId: string): Promise<string> {
  const sess = await readSession(uploadId);
  if (!sess) {
    throw notFound("上传任务不存在或会话已失效");
  }
  return tempBaseDir(sess.fileMd5, uploadId);
}

async function readGlobalHashRecord(md5: string): Promise<GlobalHashRecord | null> {
  try {
    const raw = await fs.readFile(hashIndexPath(md5), "utf8");
    return JSON.parse(raw) as GlobalHashRecord;
  } catch {
    return null;
  }
}

async function writeGlobalHashRecord(md5: string, rec: GlobalHashRecord): Promise<void> {
  await fs.mkdir(hashIndexDir(), { recursive: true });
  await fs.writeFile(hashIndexPath(md5), JSON.stringify(rec, null, 2), "utf8");
}

async function deleteGlobalHashRecord(md5: string): Promise<void> {
  await fs.unlink(hashIndexPath(md5)).catch(() => {});
}

function absPathFromPublicUploadUrl(publicUrl: string): string | null {
  const u = publicUrl.trim();
  if (!u.startsWith("/uploads/")) return null;
  const relParts = u
    .slice("/uploads/".length)
    .split("/")
    .filter((p) => p.length > 0);
  if (relParts.length === 0 || relParts.some((p) => p === "..")) return null;
  const abs = path.join(uploadsRoot, ...relParts);
  const resolved = path.resolve(abs);
  const rootResolved = path.resolve(uploadsRoot);
  const relToRoot = path.relative(rootResolved, resolved);
  // 秒传索引来自本地 JSON 文件，仍然要校验路径不能逃逸 uploadsRoot。
  if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
    return null;
  }
  return resolved;
}

async function globalHashRecordPointsToLiveFile(rec: GlobalHashRecord): Promise<boolean> {
  const abs = absPathFromPublicUploadUrl(rec.url);
  if (!abs) return false;
  try {
    const st = await fs.stat(abs);
    return st.isFile() && st.size === rec.fileSize;
  } catch {
    return false;
  }
}

async function writeMetaAt(baseDir: string, meta: LargeUploadMeta): Promise<void> {
  await fs.writeFile(path.join(baseDir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
}

export function partFileName(chunkIndex: number): string {
  return `part-${String(chunkIndex).padStart(6, "0")}.bin`;
}

function safeFileBase(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.length > 0 ? base.slice(0, 120) : "file";
}

function expectedPartSize(meta: LargeUploadMeta, index: number): number {
  const { fileSize, chunkSize, chunkTotal } = meta;
  if (index < 0 || index >= chunkTotal) {
    throw badRequest("分片下标越界");
  }
  if (index === chunkTotal - 1) {
    const full = chunkSize * (chunkTotal - 1);
    return fileSize - full;
  }
  return chunkSize;
}

async function listValidReceivedPartIndices(meta: LargeUploadMeta, dir: string): Promise<number[]> {
  const re = /^part-(\d+)\.bin$/;
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: number[] = [];
  for (const n of names) {
    const m = re.exec(n);
    if (!m) continue;
    const idx = Number(m[1]);
    if (idx < 0 || idx >= meta.chunkTotal) continue;
    const p = path.join(dir, n);
    try {
      const st = await fs.stat(p);
      const want = expectedPartSize(meta, idx);
      if (st.size === want) {
        // 只把大小匹配的分片暴露给客户端，损坏/未写完的文件不参与断点续传状态。
        out.push(idx);
      }
    } catch {
      /* 忽略损坏或竞争态 */
    }
  }
  return out.sort((a, b) => a - b);
}

async function readMeta(uploadId: string): Promise<LargeUploadMeta> {
  const base = await resolveTempDir(uploadId);
  const p = path.join(base, "meta.json");
  let raw: string;
  try {
    raw = await fs.readFile(p, "utf8");
  } catch {
    throw notFound("上传任务不存在或已完成清理");
  }
  try {
    return JSON.parse(raw) as LargeUploadMeta;
  } catch {
    throw internalError("上传元数据损坏");
  }
}

async function writeMeta(uploadId: string, meta: LargeUploadMeta): Promise<void> {
  const base = await resolveTempDir(uploadId);
  await writeMetaAt(base, meta);
}

function assertNotExpired(meta: LargeUploadMeta): void {
  const age = Date.now() - new Date(meta.createdAt).getTime();
  if (age > UPLOAD_TTL_MS) {
    throw gone("上传任务已过期，请重新发起");
  }
}

export async function initLargeUpload(body: LargeUploadInitBody, userId: number): Promise<InitLargeUploadResult> {
  const fileMd5 = body.fileMd5;
  const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS).toISOString();
  const chunkTotal = Math.ceil(body.fileSize / body.chunkSize);

  const rec = await readGlobalHashRecord(fileMd5);
  if (rec && rec.fileSize === body.fileSize && typeof rec.url === "string") {
    if (await globalHashRecordPointsToLiveFile(rec)) {
      // 全局 MD5 索引命中且文件仍存在时直接秒传；不绑定 userId，适合作为本地单实例去重能力。
      return { instant: true, publicUrl: rec.url, chunkTotal: 0, expiresAt };
    }
    // 索引指向的文件已丢失或大小不符时删除索引，避免后续一直返回坏链接。
    await deleteGlobalHashRecord(fileMd5);
  }

  const uploadId = randomUUID();
  const base = tempBaseDir(fileMd5, uploadId);
  await fs.mkdir(base, { recursive: true });
  await writeSession(uploadId, fileMd5);
  const meta: LargeUploadMeta = {
    fileName: body.fileName,
    fileSize: body.fileSize,
    chunkSize: body.chunkSize,
    chunkTotal,
    mimeType: body.mimeType,
    fileMd5,
    userId,
    createdAt: new Date().toISOString(),
    status: "uploading",
  };
  await writeMetaAt(base, meta);

  return { instant: false, uploadId, chunkTotal, expiresAt };
}

export async function getLargeUploadStatus(uploadId: string, userId: number) {
  const markerFile = doneMarkerPath(uploadId);
  try {
    // 合并完成后临时目录会被删除，status 必须先看 done marker 才能支持客户端轮询/刷新后的幂等查询。
    const raw = await fs.readFile(markerFile, "utf8");
    const rec = JSON.parse(raw) as { userId: number; url: string; chunkTotal?: number };
    if (rec.userId === userId && typeof rec.url === "string") {
      return {
        status: "done" as const,
        chunkTotal: rec.chunkTotal ?? 0,
        receivedIndices: [] as number[],
        publicUrl: rec.url,
      };
    }
  } catch {
    /* ignore */
  }

  const meta = await readMeta(uploadId);
  if (meta.userId !== userId) {
    throw forbidden("无权访问该上传任务");
  }
  assertNotExpired(meta);
  if (meta.status === "done" && meta.publicUrl) {
    return {
      status: meta.status,
      chunkTotal: meta.chunkTotal,
      receivedIndices: [] as number[],
      publicUrl: meta.publicUrl,
    };
  }
  const dir = await resolveTempDir(uploadId);
  const receivedIndices = await listValidReceivedPartIndices(meta, dir);

  return {
    status: meta.status,
    chunkTotal: meta.chunkTotal,
    receivedIndices,
    fileName: meta.fileName,
    fileSize: meta.fileSize,
    chunkSize: meta.chunkSize,
  };
}

async function md5OfFile(absPath: string): Promise<string> {
  const hash = createHash("md5");
  const rs = createReadStream(absPath);
  for await (const raw of rs) {
    if (Buffer.isBuffer(raw) || typeof raw === "string") {
      hash.update(raw);
    }
  }
  return hash.digest("hex");
}

export async function finalizeChunkWrite(
  uploadId: string,
  chunkIndex: number,
  userId: number,
  savedAbsPath: string,
  expectedChunkMd5: string,
): Promise<void> {
  const meta = await readMeta(uploadId);
  if (meta.userId !== userId) {
    throw forbidden("无权访问该上传任务");
  }
  assertNotExpired(meta);
  if (meta.status === "merging") {
    throw conflict("正在合并中，请稍后重试");
  }
  if (meta.status === "done") {
    throw conflict("上传任务已完成");
  }
  if (chunkIndex >= meta.chunkTotal) {
    throw badRequest("分片下标越界");
  }
  const want = expectedPartSize(meta, chunkIndex);
  const st = await fs.stat(savedAbsPath);
  if (st.size !== want) {
    // multer 已经把文件写入磁盘，校验失败时必须主动删除，避免坏分片被后续 status/merge 误用。
    await fs.unlink(savedAbsPath).catch(() => {});
    throw badRequest(`分片大小不符，期望 ${want} 字节`);
  }
  const actualMd5 = await md5OfFile(savedAbsPath);
  if (actualMd5 !== expectedChunkMd5) {
    // 分片 MD5 是客户端声明的端到端校验，失败同样清理落盘文件。
    await fs.unlink(savedAbsPath).catch(() => {});
    throw badRequest("分片 MD5 与声明不一致，内容可能损坏或传输不完整");
  }
}

export async function mergeLargeUpload(uploadId: string, userId: number) {
  const markerFile = doneMarkerPath(uploadId);
  try {
    // merge 可能因网络重试重复提交；已完成任务直接返回旧 URL，不再触碰已清理的临时分片。
    const raw = await fs.readFile(markerFile, "utf8");
    const rec = JSON.parse(raw) as { userId: number; url: string };
    if (rec.userId === userId && typeof rec.url === "string") {
      return { url: rec.url, merged: false };
    }
  } catch {
    /* ignore */
  }

  let meta: LargeUploadMeta;
  try {
    meta = await readMeta(uploadId);
  } catch (err) {
    try {
      // readMeta 与清理临时目录存在时间窗口，再读一次 marker 覆盖“刚合并完成”的竞争态。
      const raw = await fs.readFile(markerFile, "utf8");
      const rec = JSON.parse(raw) as { userId: number; url: string };
      if (rec.userId === userId && typeof rec.url === "string") {
        return { url: rec.url, merged: false };
      }
    } catch {
      /* ignore */
    }
    throw err;
  }

  if (meta.userId !== userId) {
    throw forbidden("无权访问该上传任务");
  }
  if (meta.status === "done" && meta.publicUrl) {
    return { url: meta.publicUrl, merged: false };
  }
  assertNotExpired(meta);

  if (meta.status === "merging") {
    // 本地文件实现没有分布式锁；merging 状态用于阻止同一 uploadId 的并发合并。
    throw conflict("正在合并中，请稍后重试");
  }

  const dir = await resolveTempDir(uploadId);
  for (let i = 0; i < meta.chunkTotal; i++) {
    const p = path.join(dir, partFileName(i));
    try {
      const st = await fs.stat(p);
      const want = expectedPartSize(meta, i);
      if (st.size !== want) {
        throw conflict(`分片 ${i} 缺失或大小不正确`);
      }
    } catch (e) {
      if (e instanceof Error && "statusCode" in e) throw e;
      throw conflict(`分片 ${i} 未就绪`);
    }
  }

  meta.status = "merging";
  await writeMeta(uploadId, meta);

  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const destDir = path.join(uploadsRoot, LARGE_FINAL_SEGMENT, y, m);
  await fs.mkdir(destDir, { recursive: true });

  const ext = path.extname(meta.fileName).toLowerCase();
  const allowedExt = [".bin", ".zip", ".pdf", ".mp4", ".mov", ".mkv", ".tar", ".gz", ".7z"];
  const suffix = allowedExt.includes(ext) ? ext : "";
  const finalName = `${Date.now()}-${randomBytes(8).toString("hex")}-${safeFileBase(meta.fileName)}${suffix}`;
  const finalAbs = path.join(destDir, finalName);
  const finalTmp = `${finalAbs}.part`;

  const writeStream = createWriteStream(finalTmp, { flags: "w" });

  try {
    const hash = createHash("md5");
    for (let i = 0; i < meta.chunkTotal; i++) {
      const partPath = path.join(dir, partFileName(i));
      const rs = createReadStream(partPath);
      for await (const raw of rs) {
        if (!(Buffer.isBuffer(raw) || typeof raw === "string")) continue;
        hash.update(raw);
        const ok = writeStream.write(raw);
        if (!ok) {
          await new Promise<void>((resolve, reject) => {
            writeStream.once("drain", resolve);
            writeStream.once("error", reject);
          });
        }
      }
    }
    writeStream.end();
    await finished(writeStream);

    const digest = hash.digest("hex");
    if (digest !== meta.fileMd5) {
      // 最终文件仍以整文件 MD5 为准；分片都正确也可能因顺序/并发写入异常导致整体不一致。
      await fs.unlink(finalTmp).catch(() => {});
      meta.status = "failed";
      await writeMeta(uploadId, meta).catch(() => {});
      throw internalError("合并后 MD5 与声明不一致");
    }

    const outStat = await fs.stat(finalTmp);
    if (outStat.size !== meta.fileSize) {
      await fs.unlink(finalTmp).catch(() => {});
      throw internalError("合并后文件大小与声明不一致");
    }
    await fs.rename(finalTmp, finalAbs);
  } catch (e) {
    writeStream.destroy();
    meta.status = "failed";
    await writeMeta(uploadId, meta).catch(() => {});
    await fs.unlink(finalTmp).catch(() => {});
    throw e;
  }

  const publicUrl = localFileStorage.toPublicUrl(finalAbs);
  meta.status = "done";
  meta.publicUrl = publicUrl;
  await fs.mkdir(path.join(projectRoot, ".data", "large-upload-done"), { recursive: true });
  // 临时目录随后会被清理，因此把完成状态写入 marker，支持客户端重试 merge/status 的幂等返回。
  await fs.writeFile(markerFile, JSON.stringify({ userId, url: publicUrl, chunkTotal: meta.chunkTotal }), "utf8");

  const existing = await readGlobalHashRecord(meta.fileMd5);
  const firstUploaderUserId = existing?.firstUploaderUserId ?? userId;
  // hash index 用于后续相同 MD5 文件秒传；只记录公开 URL，不承载权限模型。
  await writeGlobalHashRecord(meta.fileMd5, {
    fileSize: meta.fileSize,
    url: publicUrl,
    mergedAt: new Date().toISOString(),
    firstUploaderUserId,
  });

  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  await deleteSession(uploadId);

  return { url: publicUrl, merged: true };
}

export async function abortLargeUpload(uploadId: string, userId: number): Promise<void> {
  let meta: LargeUploadMeta;
  try {
    meta = await readMeta(uploadId);
  } catch {
    await deleteSession(uploadId);
    return;
  }
  if (meta.userId !== userId) {
    throw forbidden("无权访问该上传任务");
  }
  if (meta.status === "done") {
    return;
  }
  const dir = await resolveTempDir(uploadId);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  await deleteSession(uploadId);
}

export const localLargeUploadStorage: LargeUploadStorage = {
  resolveChunkDir: syncResolveLargeUploadChunkDir,
  partFileName,
  init: initLargeUpload,
  getStatus: getLargeUploadStatus,
  finalizeChunk: finalizeChunkWrite,
  merge: mergeLargeUpload,
  abort: abortLargeUpload,
};
