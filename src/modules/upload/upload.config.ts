/**
 * 文件职责：配置普通图片上传的 multer 存储策略。
 * 通用图片与头像图片落到不同目录段，最终通过 /uploads 静态路径公开访问。
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import multer from "multer";

import { projectRoot } from "../../utils/projectRoot.js";

/** 上传根目录：当前仓库根 `uploads/` */
export const uploadsRoot = path.join(projectRoot, "uploads");

/** 通用图片：`POST /api/uploads` → `<uploadsRoot>/common/<年>/<月>/` → `/uploads/common/...` */
export const commonUploadDiskSegment = "common";

/** 用户头像等：`POST /api/uploads/profiles` → `<uploadsRoot>/profiles/<年>/<月>/` → `/uploads/profiles/...` */
export const profileUploadDiskSegment = "profiles";

export function ensureUploadsRoot() {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const ok = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype);
  if (!ok) {
    cb(new Error("仅支持 jpeg、png、gif、webp 图片"));
    return;
  }
  cb(null, true);
};

function createYmDiskStorage(diskSegment: string): multer.StorageEngine {
  return multer.diskStorage({
    destination(_req, _file, cb) {
      const now = new Date();
      const y = String(now.getFullYear());
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const dir = path.join(uploadsRoot, diskSegment, y, m);
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

const commonStorage = createYmDiskStorage(commonUploadDiskSegment);
const profileStorage = createYmDiskStorage(profileUploadDiskSegment);

/** 表单字段名 `files`，通用图片最多 9 个，单文件最大 8MB */
export const uploadImagesMiddleware = multer({
  storage: commonStorage,
  limits: { fileSize: 8 * 1024 * 1024, files: 9 },
  fileFilter,
}).array("files", 9);

/** 头像等：`POST /api/uploads/profiles` → `profiles/`，单次仅 1 个文件，单文件最大 8MB */
export const uploadProfileImagesMiddleware = multer({
  storage: profileStorage,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter,
}).array("files", 1);

export function filePathToPublicUrl(absPath: string) {
  const rel = path.relative(uploadsRoot, absPath).split(path.sep).join("/");
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("非法上传路径");
  }
  return `/uploads/${rel}`;
}
