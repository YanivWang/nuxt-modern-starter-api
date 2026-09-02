/**
 * 文件职责：实现本地磁盘大文件分片上传。
 * 维护 init/status/chunk/merge/abort 流程，以及 .data 中的会话、完成标记和全局 MD5 秒传索引。
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import fsSync, { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";

import { absPathFromPublicUploadUrl, expectedPartSize, partFileName, safeFileBase } from "./large-upload.internals.js";
import { localFileStorage } from "./local-file-storage.adapter.js";
import { UPLOAD_TEMP_RETENTION_HOURS } from "../../env.js";
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  gone,
  internalError,
  notFound,
} from "../../shared/errors/app-error.js";
import { projectRoot } from "../../utils/projectRoot.js";

import type { LargeUploadInitBody } from "../../modules/upload/large-upload.schema.js";
import type {
  InitLargeUploadResult,
  LargeUploadMergeResult,
  LargeUploadStatus,
  LargeUploadStorage,
} from "../../modules/upload/ports/large-upload-storage.port.js";

const uploadsRoot = localFileStorage.root;

export { partFileName } from "./large-upload.internals.js";

/**
 * 分片暂存根目录。
 *
 * 必须在 uploadsRoot 之外：app.ts 用 express.static 把整个 uploadsRoot 无鉴权地挂在 /uploads 下，
 * 暂存目录一旦落在里面，未合并的分片和含 userId、原始文件名的 meta.json 就都能被匿名下载。
 * 它和会话、完成标记、秒传索引一样属于服务端私有状态，因此统一放在 .data 下
 * （生产 Compose 已为 .data 配置持久化卷）。
 */
export const LARGE_UPLOAD_CHUNKS_ROOT = path.join(projectRoot, ".data", "large-upload-chunks");

/**
 * 旧版本的分片暂存位置，保留仅供清理任务回收。
 * 升级前留在磁盘上的分片不会再被读写，但没人删就会永远占着空间。
 */
const LEGACY_CHUNKS_ROOT = path.join(localFileStorage.root, "chunks-temp");

/** 合并后落盘子目录（与静态 /uploads/... 对齐） */
export const LARGE_FINAL_SEGMENT = "large";

/**
 * 上传任务寿命。
 *
 * 直接由清理任务的保留时长推导，而不是再写一个 24 小时常量：
 * 两个独立的数字描述同一段寿命时，运维只要调其中一个就会出现
 * 「任务还没过期但分片已被清走」或者「分片还在但任务已判过期」的错位。
 */
const UPLOAD_TTL_MS = UPLOAD_TEMP_RETENTION_HOURS * 60 * 60 * 1000;

/**
 * merging 状态的锁超时。
 *
 * merging 是用文件状态实现的互斥锁，而持锁进程可能在合并中途被杀掉。
 * 没有超时的话这把锁永远不会释放，该任务此后每次 merge/chunk 都只能拿到 409，
 * 直到整个任务过期——即「进程崩过一次，这个上传就废了」。
 */
const MERGE_LOCK_TTL_MS = 30 * 60 * 1000;

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

/**
 * Multer `destination` 同步回调：分片目录 `<chunksRoot>/<fileMd5>/<uploadId>/`。
 *
 * 这里必须完成归属校验，而不是留给后面的 controller：multer 在 destination 返回后
 * 立刻建流写盘，等 controller 拿到请求时字节已经落在别人的目录里了——
 * 那时再抛 403 只是「事后通知」，受害者的分片已经被覆写。
 * 判据用的是与 controller 完全相同的一份 meta.json，不另存一份归属信息。
 */
export function syncResolveLargeUploadChunkDir(uploadId: string, userId: number): string {
  const fileMd5 = readSessionFileMd5(uploadId);
  const dir = tempBaseDir(fileMd5, uploadId);
  assertChunkWritable(readMetaSyncAt(dir), userId);
  return dir;
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
  /** 进入 merging 的时刻；用于判断这把文件锁是否已被崩溃的进程遗弃。 */
  mergingStartedAt?: string;
};

function tempBaseDir(fileMd5: string, uploadId: string): string {
  // fileMd5 参与目录分层，便于同一内容的临时任务聚集，也避免 uploadId 单层目录过大。
  return path.join(LARGE_UPLOAD_CHUNKS_ROOT, fileMd5, uploadId);
}

function metaPathAt(baseDir: string): string {
  return path.join(baseDir, "meta.json");
}

/** 同步读取 meta.json，供 multer 的同步回调在落盘前判定归属。 */
function readMetaSyncAt(baseDir: string): LargeUploadMeta {
  let raw: string;
  try {
    raw = fsSync.readFileSync(metaPathAt(baseDir), "utf8");
  } catch {
    throw notFound("上传任务不存在或已完成清理");
  }
  try {
    return JSON.parse(raw) as LargeUploadMeta;
  } catch {
    throw internalError("上传元数据损坏");
  }
}

/** merging 锁是否已被遗弃：没有起始时间的是升级前留下的旧数据，保守视为仍然持有。 */
function mergeLockExpired(meta: LargeUploadMeta): boolean {
  if (meta.status !== "merging") return false;
  if (!meta.mergingStartedAt) return false;
  const startedAt = new Date(meta.mergingStartedAt).getTime();
  if (!Number.isFinite(startedAt)) return false;
  return Date.now() - startedAt > MERGE_LOCK_TTL_MS;
}

/**
 * 分片可写性判定，供落盘前的同步回调与落盘后的 finalize 共用。
 * 两处必须用同一段判断，否则「拦不拦得住」会取决于走的是哪条路径。
 */
function assertChunkWritable(meta: LargeUploadMeta, userId: number): LargeUploadMeta {
  if (meta.userId !== userId) throw forbidden("无权访问该上传任务");
  assertNotExpired(meta);
  if (meta.status === "done") throw conflict("上传任务已完成");
  if (meta.status === "merging" && !mergeLockExpired(meta)) throw conflict("正在合并中，请稍后重试");
  return meta;
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

async function globalHashRecordPointsToLiveFile(rec: GlobalHashRecord): Promise<boolean> {
  const abs = absPathFromPublicUploadUrl(uploadsRoot, rec.url);
  if (!abs) return false;
  try {
    const st = await fs.stat(abs);
    return st.isFile() && st.size === rec.fileSize;
  } catch {
    return false;
  }
}

async function writeMetaAt(baseDir: string, meta: LargeUploadMeta): Promise<void> {
  await fs.writeFile(metaPathAt(baseDir), JSON.stringify(meta, null, 2), "utf8");
}

/** 越界下标在此转换为 400；纯计算逻辑见 large-upload.internals.ts。 */
function requirePartSize(meta: LargeUploadMeta, index: number): number {
  const size = expectedPartSize(meta, index);
  if (size === null) {
    throw badRequest("分片下标越界");
  }
  return size;
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
  const p = metaPathAt(base);
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

// 显式标注返回类型（而不是让 TS 推断）：推断出的类型只会比契约更宽，
// 多返回的字段既不在 Port 里也不在 OpenAPI 里，却已经被客户端看到。
export async function getLargeUploadStatus(uploadId: string, userId: number): Promise<LargeUploadStatus> {
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
  // 任何一条拒绝路径都必须把 multer 已写下的文件删掉，而不是只在大小/MD5 不符时删：
  // 留在磁盘上的分片会被 status/merge 当成有效分片读到，也会一直占着空间等清理任务。
  try {
    const meta = await readMeta(uploadId);
    assertChunkWritable(meta, userId);
    if (chunkIndex >= meta.chunkTotal) {
      throw badRequest("分片下标越界");
    }
    const want = requirePartSize(meta, chunkIndex);
    const st = await fs.stat(savedAbsPath);
    if (st.size !== want) {
      throw badRequest(`分片大小不符，期望 ${want} 字节`);
    }
    const actualMd5 = await md5OfFile(savedAbsPath);
    if (actualMd5 !== expectedChunkMd5) {
      // 分片 MD5 是客户端声明的端到端校验。
      throw badRequest("分片 MD5 与声明不一致，内容可能损坏或传输不完整");
    }
  } catch (error) {
    await fs.unlink(savedAbsPath).catch(() => {});
    throw error;
  }
}

export async function mergeLargeUpload(uploadId: string, userId: number): Promise<LargeUploadMergeResult> {
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

  if (meta.status === "merging" && !mergeLockExpired(meta)) {
    // 本地文件实现没有分布式锁；merging 状态用于阻止同一 uploadId 的并发合并。
    // 超过 MERGE_LOCK_TTL_MS 仍停在 merging，说明上一个持锁进程没能走完，允许重新合并。
    throw conflict("正在合并中，请稍后重试");
  }

  const dir = await resolveTempDir(uploadId);
  for (let i = 0; i < meta.chunkTotal; i++) {
    const p = path.join(dir, partFileName(i));
    try {
      const st = await fs.stat(p);
      const want = requirePartSize(meta, i);
      if (st.size !== want) {
        throw conflict(`分片 ${i} 缺失或大小不正确`);
      }
    } catch (e) {
      // AppError 携带的是 code 而非 statusCode；这里必须按类型判断，
      // 否则上面那条「缺失或大小不正确」以及 requirePartSize 的 400 都会被这一行吞成 409。
      if (e instanceof AppError) throw e;
      throw conflict(`分片 ${i} 未就绪`);
    }
  }

  meta.status = "merging";
  meta.mergingStartedAt = new Date().toISOString();
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
        if (!writeStream.write(raw)) {
          // 必须用 events.once：手写的 new Promise(...once("drain")...once("error")...) 在 drain
          // 触发后不会摘掉那条 error 监听，每次背压都留一条，合并 1GB 文件会累计上千条监听器
          // （超过 10 条即触发 MaxListenersExceededWarning）。events.once 在 settle 时两条都清理。
          await once(writeStream, "drain");
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
  delete meta.mergingStartedAt;
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

/** 清理一个分片暂存根目录下所有过期的上传任务，返回删除数量。 */
async function purgeStaleChunkRoot(tempRoot: string, cutoff: number): Promise<number> {
  let removed = 0;
  let md5Dirs: string[];
  try {
    md5Dirs = await fs.readdir(tempRoot);
  } catch {
    return 0;
  }

  for (const md5Dir of md5Dirs) {
    const md5Path = path.join(tempRoot, md5Dir);
    let uploadDirs: string[];
    try {
      uploadDirs = await fs.readdir(md5Path);
    } catch {
      continue;
    }
    for (const uploadId of uploadDirs) {
      const uploadPath = path.join(md5Path, uploadId);
      try {
        const st = await fs.stat(uploadPath);
        if (!st.isDirectory() || st.mtimeMs >= cutoff) continue;
        await fs.rm(uploadPath, { recursive: true, force: true });
        await deleteSession(uploadId);
        removed += 1;
      } catch {
        /* 并发清理或权限问题时跳过，下一轮再试 */
      }
    }
    // 目录空了就一并移除，避免 md5 分层目录无限累积空壳。
    await fs.rmdir(md5Path).catch(() => {});
  }

  return removed;
}

/**
 * 清理超过保留期的临时分片目录、上传会话和完成标记。
 * 客户端上传到一半掉线时不会调用 abort，若无人清理这些分片会永久占用磁盘。
 */
export async function purgeStaleLargeUploads(
  retentionHours: number,
): Promise<{ removedUploads: number; removedSessions: number }> {
  const cutoff = Date.now() - retentionHours * 60 * 60 * 1000;
  let removedUploads = 0;
  let removedSessions = 0;

  // LEGACY_CHUNKS_ROOT 一并扫：分片暂存目录搬到 .data 之后，升级前留在 uploads/ 下的
  // 分片不会再被任何请求路径碰到，没人清就会永久占着磁盘。
  for (const tempRoot of [LARGE_UPLOAD_CHUNKS_ROOT, LEGACY_CHUNKS_ROOT]) {
    removedUploads += await purgeStaleChunkRoot(tempRoot, cutoff);
  }

  // 会话文件可能因为进程中断而与分片目录失联，单独按时间兜底清理。
  let sessionFiles: string[];
  try {
    sessionFiles = await fs.readdir(sessionsDir());
  } catch {
    sessionFiles = [];
  }
  for (const name of sessionFiles) {
    const filePath = path.join(sessionsDir(), name);
    try {
      const st = await fs.stat(filePath);
      if (st.mtimeMs >= cutoff) continue;
      await fs.unlink(filePath);
      removedSessions += 1;
    } catch {
      /* 忽略 */
    }
  }

  return { removedUploads, removedSessions };
}

export const localLargeUploadStorage: LargeUploadStorage = {
  resolveChunkDir: syncResolveLargeUploadChunkDir,
  partFileName,
  init: initLargeUpload,
  getStatus: getLargeUploadStatus,
  finalizeChunk: finalizeChunkWrite,
  merge: mergeLargeUpload,
  abort: abortLargeUpload,
  purgeStale: purgeStaleLargeUploads,
};
