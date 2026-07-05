/**
 * 文件职责：文档领域服务。
 * 文档读取和保存必须按 ownerId 过滤，避免用户越权访问其他人的内容。
 */
import { Document, Project, sequelize } from "../../db.js";
import { toDocumentDto } from "../workspace/workspace.service.js";

export async function findDocumentForUser(userId: number, documentId: string) {
  const document = await Document.findOne({
    where: { id: documentId, ownerId: userId },
  });

  return document ? toDocumentDto(document) : null;
}

export async function updateDocumentForUser(
  userId: number,
  documentId: string,
  payload: {
    title?: string;
    content?: string;
  },
) {
  return sequelize.transaction(async (transaction) => {
    const document = await Document.findOne({
      where: { id: documentId, ownerId: userId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!document) return null;

    const nextTitle = payload.title ?? (document.get("title") as string);
    const nextContent = payload.content ?? (document.get("content") as string);

    await document.update(
      {
        title: nextTitle,
        content: nextContent,
      },
      { transaction },
    );

    await Project.update(
      {
        title: nextTitle,
      },
      {
        where: {
          id: document.get("projectId"),
          ownerId: userId,
        },
        transaction,
      },
    );

    return toDocumentDto(document);
  });
}
