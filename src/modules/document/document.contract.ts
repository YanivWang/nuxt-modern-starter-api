/** 文件职责：定义文档模块可跨模块使用的 DTO 与映射。 */
import type { Model } from "sequelize";

export type DocumentDto = {
  id: string;
  projectId: string;
  title: string;
  content: string;
  updatedAt: string;
};

const toIso = (value: unknown) => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return new Date().toISOString();
};

export function toDocumentDto(document: Model): DocumentDto {
  return {
    id: document.get("id") as string,
    projectId: document.get("projectId") as string,
    title: document.get("title") as string,
    content: document.get("content") as string,
    updatedAt: toIso(document.get("updatedAt")),
  };
}
