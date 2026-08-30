/** 文件职责：定义文档模块可跨模块使用的 DTO 与映射。 */
import type { Document } from "./document.model.js";

export type DocumentDto = {
  id: string;
  projectId: string;
  title: string;
  content: string;
  updatedAt: string;
};

export function toDocumentDto(document: Document): DocumentDto {
  return {
    id: document.id,
    projectId: document.projectId,
    title: document.title,
    content: document.content,
    updatedAt: document.updatedAt.toISOString(),
  };
}
