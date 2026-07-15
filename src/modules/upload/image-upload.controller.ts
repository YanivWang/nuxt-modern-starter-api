/**
 * 文件职责：普通图片上传控制器。
 * multer 完成文件落盘后，这里把磁盘路径转换成可公开访问的 /uploads URL。
 */
import { createHttpError } from "../../middlewares/error.middleware.js";
import { success } from "../../utils/response.js";
import { filePathToPublicUrl } from "./storage/local-storage.service.js";

import type { Request, Response } from "express";

export async function uploadImages(req: Request, res: Response) {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    throw createHttpError(400, "请选择要上传的图片文件（表单字段名 files）");
  }
  const urls = files.map((f: Express.Multer.File) => filePathToPublicUrl(f.path));
  return success(res, "上传成功", { urls });
}
