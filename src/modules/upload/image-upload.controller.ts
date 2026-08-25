/**
 * 文件职责：普通图片上传的响应适配。
 * multer 已完成落盘，这里只把绝对路径经 FileStorage 转换为 /uploads 公开 URL。
 */
import { badRequest } from "../../shared/errors/app-error.js";
import { success } from "../../utils/response.js";

import type { FileStorage } from "./ports/file-storage.port.js";
import type { Request, Response } from "express";

export function createImageUploadController(storage: FileStorage) {
  return async function uploadImages(req: Request, res: Response) {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files?.length) throw badRequest("请选择要上传的图片文件（表单字段名 files）");
    return success(res, "上传成功", { urls: files.map((file) => storage.toPublicUrl(file.path)) });
  };
}
