import { createHash, randomBytes, randomUUID } from "node:crypto";
import fsSync, { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { finished, pipeline } from "node:stream/promises";

import { filePathToPublicUrl, uploadsRoot } from "../config/upload.config.js";
import { createHttpError } from "../middlewares/error.middleware.js";
import { projectRoot } from "../utils/projectRoot.js";

import type { LargeUploadInitBody } from "../schema/large-upload.schema.js";

/** 临时分片目录（相对 uploadsRoot） */
export const LARGE_CHUNKS_TEMP_SEGMENT = "chunks-temp";

/** 合并后落盘子目录（与静态 /uploads/... 对齐） */
export const LARGE_FINAL_SEGMENT = "large";

const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const FILE_MD5_RE = /^[a-f0-9]{32}$/;

function doneMarkerPath(uploadId: string): string {
  return path.join(projectRoot, ".data", "large-upload-done", `${uploadId}.json`);
}

function sessionsDir(): string {
  return path.join(projectRoot, ".data", "large-upload-sessions");
}

function sessionPath(uploadId: string): string {
  return path.join(sessionsDir(), `${uploadId}.json`);
}

function normalizeFileMd5(md5: string): string {
  const lower = md5.toLowerCase();
  if (!FILE_MD5_RE.test(lower)) {
    throw createHttpError(400, "fileMd5 须为 32 位十六进制");
  }
  return lower;
}

function readSessionFileMd5(uploadId: string): string {
  let raw: string;
  try {
    raw = fsSync.readFileSync(sessionPath(uploadId), "utf8");
  } catch {
    throw createHttpError(404, "上传任务不存在或会话已失效");
  }
  const j = JSON.parse(raw) as { fileMd5?: string };
  if (typeof j.fileMd5 !== "string") {
    throw createHttpError(500, "上传会话损坏");
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

export type InitLargeUploadResult =
  | { instant: true; publicUrl: string; chunkTotal: 0; expiresAt: string }
  | { instant: false; uploadId: string; chunkTotal: number; expiresAt: string };

function tempBaseDir(fileMd5: string, uploadId: string): string {
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
    throw createHttpError(404, "上传任务不存在或会话已失效");
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
    throw createHttpError(400, "分片下标越界");
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
    throw createHttpError(404, "上传任务不存在或已完成清理");
  }
  try {
    return JSON.parse(raw) as LargeUploadMeta;
  } catch {
    throw createHttpError(500, "上传元数据损坏");
  }
}

async function writeMeta(uploadId: string, meta: LargeUploadMeta): Promise<void> {
  const base = await resolveTempDir(uploadId);
  await writeMetaAt(base, meta);
}

function assertNotExpired(meta: LargeUploadMeta): void {
  const age = Date.now() - new Date(meta.createdAt).getTime();
  if (age > UPLOAD_TTL_MS) {
    throw createHttpError(410, "上传任务已过期，请重新发起");
  }
}

export async function initLargeUpload(
  body: LargeUploadInitBody,
  _userId: number,
): Promise<InitLargeUploadResult> {
  const fileMd5 = body.fileMd5;
  const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS).toISOString();
  const chunkTotal = Math.ceil(body.fileSize / body.chunkSize);

  const rec = await readGlobalHashRecord(fileMd5);
  if (rec && rec.fileSize === body.fileSize && typeof rec.url === "string") {
    if (await globalHashRecordPointsToLiveFile(rec)) {
      return { instant: true, publicUrl: rec.url, chunkTotal: 0, expiresAt };
    }
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
    userId: _userId,
    createdAt: new Date().toISOString(),
    status: "uploading",
  };
  await writeMetaAt(base, meta);

  return { instant: false, uploadId, chunkTotal, expiresAt };
}

export async function getLargeUploadStatus(uploadId: string, userId: number) {
  const markerFile = doneMarkerPath(uploadId);
  try {
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
    throw createHttpError(403, "无权访问该上传任务");
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
    throw createHttpError(403, "无权访问该上传任务");
  }
  assertNotExpired(meta);
  if (meta.status === "merging") {
    throw createHttpError(409, "正在合并中，请稍后重试");
  }
  if (meta.status === "done") {
    throw createHttpError(409, "上传任务已完成");
  }
  if (chunkIndex >= meta.chunkTotal) {
    throw createHttpError(400, "分片下标越界");
  }
  const want = expectedPartSize(meta, chunkIndex);
  const st = await fs.stat(savedAbsPath);
  if (st.size !== want) {
    await fs.unlink(savedAbsPath).catch(() => {});
    throw createHttpError(400, `分片大小不符，期望 ${want} 字节`);
  }
  const actualMd5 = await md5OfFile(savedAbsPath);
  if (actualMd5 !== expectedChunkMd5) {
    await fs.unlink(savedAbsPath).catch(() => {});
    throw createHttpError(400, "分片 MD5 与声明不一致，内容可能损坏或传输不完整");
  }
}

export async function mergeLargeUpload(uploadId: string, userId: number) {
  const markerFile = doneMarkerPath(uploadId);
  try {
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
    throw createHttpError(403, "无权访问该上传任务");
  }
  if (meta.status === "done" && meta.publicUrl) {
    return { url: meta.publicUrl, merged: false };
  }
  assertNotExpired(meta);

  if (meta.status === "merging") {
    throw createHttpError(409, "正在合并中，请稍后重试");
  }

  const dir = await resolveTempDir(uploadId);
  for (let i = 0; i < meta.chunkTotal; i++) {
    const p = path.join(dir, partFileName(i));
    try {
      const st = await fs.stat(p);
      const want = expectedPartSize(meta, i);
      if (st.size !== want) {
        throw createHttpError(409, `分片 ${i} 缺失或大小不正确`);
      }
    } catch (e) {
      if (e instanceof Error && "statusCode" in e) throw e;
      throw createHttpError(409, `分片 ${i} 未就绪`);
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
      await fs.unlink(finalTmp).catch(() => {});
      meta.status = "failed";
      await writeMeta(uploadId, meta).catch(() => {});
      throw createHttpError(500, "合并后 MD5 与声明不一致");
    }

    const outStat = await fs.stat(finalTmp);
    if (outStat.size !== meta.fileSize) {
      await fs.unlink(finalTmp).catch(() => {});
      throw createHttpError(500, "合并后文件大小与声明不一致");
    }
    await fs.rename(finalTmp, finalAbs);
  } catch (e) {
    writeStream.destroy();
    meta.status = "failed";
    await writeMeta(uploadId, meta).catch(() => {});
    await fs.unlink(finalTmp).catch(() => {});
    throw e;
  }

  const publicUrl = filePathToPublicUrl(finalAbs);
  meta.status = "done";
  meta.publicUrl = publicUrl;
  await fs.mkdir(path.join(projectRoot, ".data", "large-upload-done"), { recursive: true });
  await fs.writeFile(
    markerFile,
    JSON.stringify({ userId, url: publicUrl, chunkTotal: meta.chunkTotal }),
    "utf8",
  );

  const existing = await readGlobalHashRecord(meta.fileMd5);
  const firstUploaderUserId = existing?.firstUploaderUserId ?? userId;
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
    throw createHttpError(403, "无权访问该上传任务");
  }
  if (meta.status === "done") {
    return;
  }
  const dir = await resolveTempDir(uploadId);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  await deleteSession(uploadId);
}
