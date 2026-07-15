/**
 * 文件职责：封装本地磁盘上传存储路径。
 * 当前上传实现落盘到仓库根 uploads/，并通过 /uploads 静态路径公开访问；对象存储接入前只维护这一个本地实现。
 */
import fs from "node:fs";
import path from "node:path";

import { projectRoot } from "../../../utils/projectRoot.js";

/** 上传根目录：当前仓库根 `uploads/` */
export const uploadsRoot = path.join(projectRoot, "uploads");

export function ensureUploadsRoot() {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

export function filePathToPublicUrl(absPath: string) {
  const rel = path.relative(uploadsRoot, absPath).split(path.sep).join("/");
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("非法上传路径");
  }
  return `/uploads/${rel}`;
}
