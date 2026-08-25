/**
 * 文件职责：文档接口的 HTTP 适配层。
 * 读取登录用户与校验结果，Service 返回 null 时统一映射为 404。
 */
import { notFound, unauthorized } from "../../shared/errors/app-error.js";
import { getValidated } from "../../utils/getValidated.js";
import { success } from "../../utils/response.js";

import type { DocumentService } from "./document.service.js";
import type { ValidatedDocumentIdParamsSchema, ValidatedPatchDocumentSchema } from "./document.schema.js";
import type { Request, Response } from "express";

function currentUserId(req: Request) {
  const id = req.user?.id;
  if (typeof id !== "number" || !Number.isFinite(id)) throw unauthorized("未登录或登录已过期");
  return id;
}

export function createDocumentController(service: DocumentService) {
  return {
    get: async (req: Request, res: Response) => {
      const { params } = getValidated<ValidatedDocumentIdParamsSchema>(req);
      const document = await service.findForUser(currentUserId(req), params.documentId);
      if (!document) throw notFound("文档不存在");
      return success(res, "获取文档成功", { document });
    },
    patch: async (req: Request, res: Response) => {
      const { body, params } = getValidated<ValidatedPatchDocumentSchema>(req);
      const document = await service.updateForUser(currentUserId(req), params.documentId, body);
      if (!document) throw notFound("文档不存在");
      return success(res, "保存文档成功", { document });
    },
  };
}

export type DocumentController = ReturnType<typeof createDocumentController>;
