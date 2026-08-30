/**
 * 文件职责：大文件分片上传中与磁盘状态无关的纯逻辑。
 * 这些函数承载路径逃逸防护、文件名净化和分片边界计算，是该模块最需要被单独测试的部分，
 * 因此从依赖文件系统的 adapter 中拆出来，避免只能通过端到端流程间接覆盖。
 */
import path from "node:path";

export type ChunkLayout = {
  fileSize: number;
  chunkSize: number;
  chunkTotal: number;
};

/** 分片文件名：定长零填充保证目录内字典序与分片序号一致。 */
export function partFileName(chunkIndex: number): string {
  return `part-${String(chunkIndex).padStart(6, "0")}.bin`;
}

/**
 * 计算某个分片的期望字节数；最后一片通常短于 chunkSize。
 * 越界下标返回 null，由调用方转换成 400，而不是在这里抛 HTTP 语义的错误。
 */
export function expectedPartSize(layout: ChunkLayout, index: number): number | null {
  const { fileSize, chunkSize, chunkTotal } = layout;
  if (!Number.isInteger(index) || index < 0 || index >= chunkTotal) return null;
  if (index === chunkTotal - 1) return fileSize - chunkSize * (chunkTotal - 1);
  return chunkSize;
}

/** 净化上传文件名：只保留安全字符并限长，避免路径穿越与超长文件名。 */
export function safeFileBase(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.length > 0 ? base.slice(0, 120) : "file";
}

/**
 * 把 /uploads/... 公开 URL 还原成绝对路径，并确保结果不会逃逸出上传根目录。
 * 秒传索引来自本地 JSON 文件，一旦该文件被篡改就可能指向任意路径，因此这里必须做边界校验。
 */
export function absPathFromPublicUploadUrl(uploadsRoot: string, publicUrl: string): string | null {
  const u = publicUrl.trim();
  if (!u.startsWith("/uploads/")) return null;
  const relParts = u
    .slice("/uploads/".length)
    .split("/")
    .filter((p) => p.length > 0);
  if (relParts.length === 0 || relParts.some((p) => p === "..")) return null;
  const resolved = path.resolve(path.join(uploadsRoot, ...relParts));
  const relToRoot = path.relative(path.resolve(uploadsRoot), resolved);
  if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) return null;
  return resolved;
}
