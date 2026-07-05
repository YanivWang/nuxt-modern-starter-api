/**
 * 文件职责：文档 HTTP 控制器。
 */
import { createHttpError } from "../../middlewares/error.middleware.js";
import { getValidated } from "../../utils/getValidated.js";
import { success } from "../../utils/response.js";
import { findDocumentForUser, updateDocumentForUser } from "./document.service.js";

import type { ValidatedDocumentIdParamsSchema, ValidatedPatchDocumentSchema } from "./document.schema.js";
import type { Request, Response } from "express";

function currentUserId(req: Request) {
  const uid = req.user?.id;
  if (typeof uid !== "number" || !Number.isFinite(uid)) {
    throw createHttpError(401, "未登录或登录已过期");
  }
  return uid;
}

export async function getDocument(req: Request, res: Response) {
  const { params } = getValidated<ValidatedDocumentIdParamsSchema>(req);
  const document = await findDocumentForUser(currentUserId(req), params.documentId);

  if (!document) {
    throw createHttpError(404, "文档不存在");
  }

  return success(res, "获取文档成功", { document });
}

export async function patchDocument(req: Request, res: Response) {
  const { body, params } = getValidated<ValidatedPatchDocumentSchema>(req);
  const document = await updateDocumentForUser(currentUserId(req), params.documentId, body);

  if (!document) {
    throw createHttpError(404, "文档不存在");
  }

  return success(res, "保存文档成功", { document });
}
