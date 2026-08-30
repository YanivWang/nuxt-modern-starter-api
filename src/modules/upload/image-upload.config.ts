/**
 * 文件职责：配置普通图片上传的 multer 存储策略。
 * 通用图片与头像图片落到不同目录段，最终通过 /uploads 静态路径公开访问。
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import multer from "multer";

import { badRequest } from "../../shared/errors/app-error.js";

import type { FileStorage } from "./ports/file-storage.port.js";

/** 通用图片：`POST /api/uploads` → `<uploadsRoot>/common/<年>/<月>/` → `/uploads/common/...` */
export const commonUploadDiskSegment = "common";

/** 用户头像等：`POST /api/uploads/profiles` → `<uploadsRoot>/profiles/<年>/<月>/` → `/uploads/profiles/...` */
export const profileUploadDiskSegment = "profiles";

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const ok = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype);
  if (!ok) {
    // 直接抛业务错误类型，errorMiddleware 据此映射 400；不要让上层去匹配错误文案。
    cb(badRequest("仅支持 jpeg、png、gif、webp 图片"));
    return;
  }
  cb(null, true);
};

function createYmDiskStorage(root: string, diskSegment: string): multer.StorageEngine {
  return multer.diskStorage({
    destination(_req, _file, cb) {
      const now = new Date();
      const y = String(now.getFullYear());
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const dir = path.join(root, diskSegment, y, m);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
      // 扩展名只用于浏览器/静态资源识别；真实类型仍以前面的 mimetype 白名单为准。
      const suffix = allowed.includes(ext) ? ext : "";
      cb(null, `${Date.now()}-${randomBytes(8).toString("hex")}${suffix}`);
    },
  });
}

export function createImageUploadMiddlewares(storage: FileStorage) {
  return {
    common: multer({
      storage: createYmDiskStorage(storage.root, commonUploadDiskSegment),
      limits: { fileSize: 8 * 1024 * 1024, files: 9 },
      fileFilter,
    }).array("files", 9),
    profile: multer({
      storage: createYmDiskStorage(storage.root, profileUploadDiskSegment),
      limits: { fileSize: 8 * 1024 * 1024, files: 1 },
      fileFilter,
    }).array("files", 1),
  };
}
