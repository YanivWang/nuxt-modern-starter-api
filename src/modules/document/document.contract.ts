/**
 * 文件职责：定义文档模块可跨模块使用的响应契约与映射。
 *
 * DocumentDto 由 schema 推导：toDocumentDto 少写或改名一个字段会直接编译失败，
 * 而不是等到前端渲染出空白才被发现。
 */
import { z } from "zod";

import { apiEnvelope } from "../../shared/http/api-envelope.js";

import type { Document } from "./document.model.js";

export const documentDtoSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  /** 编辑器 HTML 正文；新建文档时为空串，不是 null。 */
  content: z.string(),
  updatedAt: z.string(),
});

export type DocumentDto = z.infer<typeof documentDtoSchema>;

export const documentEnvelopeSchema = apiEnvelope(z.object({ document: documentDtoSchema }));

export function toDocumentDto(document: Document): DocumentDto {
  return {
    id: document.id,
    projectId: document.projectId,
    title: document.title,
    content: document.content,
    updatedAt: document.updatedAt.toISOString(),
  };
}
