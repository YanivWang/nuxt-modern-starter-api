/**
 * 文件职责：文档读取与保存用例。
 * 查询按 ownerId 过滤实现资源归属校验；保存在同一事务内把标题同步回关联 Project。
 */
import { toDocumentDto } from "./document.contract.js";

import type { AppDatabase } from "../../db/index.js";

export function createDocumentService(database: AppDatabase) {
  const { Document, Project } = database.models;

  async function findForUser(userId: number, documentId: string) {
    const document = await Document.findOne({ where: { id: documentId, ownerId: userId } });
    return document ? toDocumentDto(document) : null;
  }

  async function updateForUser(userId: number, documentId: string, payload: { title?: string; content?: string }) {
    return database.sequelize.transaction(async (transaction) => {
      const document = await Document.findOne({
        where: { id: documentId, ownerId: userId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!document) return null;

      const title = payload.title ?? (document.get("title") as string);
      await document.update(
        { title, content: payload.content ?? (document.get("content") as string) },
        { transaction },
      );
      await Project.update({ title }, { where: { id: document.get("projectId"), ownerId: userId }, transaction });
      return toDocumentDto(document);
    });
  }

  return { findForUser, updateForUser };
}

export type DocumentService = ReturnType<typeof createDocumentService>;
