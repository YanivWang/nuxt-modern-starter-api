import { toDocumentDto } from "../document/document.contract.js";

import type { AppDatabase } from "../../db/index.js";
import type { Model, Transaction } from "sequelize";

export type ProjectDto = {
  id: string;
  workspaceId: string;
  documentId: string | null;
  title: string;
  description: string | null;
  status: string;
  slideCount: number;
  accent: string;
  updatedAt: string;
  editPath: string;
  previewPath: string;
};

const toIso = (value: unknown) =>
  value instanceof Date
    ? value.toISOString()
    : typeof value === "string"
      ? new Date(value).toISOString()
      : new Date().toISOString();

export function toProjectDto(project: Model): ProjectDto {
  const document = project.get("document") as Model | null | undefined;
  const id = project.get("id") as string;
  return {
    id,
    workspaceId: project.get("workspaceId") as string,
    documentId: document ? (document.get("id") as string) : null,
    title: project.get("title") as string,
    description: (project.get("description") as string | null | undefined) ?? null,
    status: project.get("status") as string,
    slideCount: project.get("slideCount") as number,
    accent: project.get("accent") as string,
    updatedAt: toIso(project.get("updatedAt")),
    editPath: `/app/workspace/${id}/edit`,
    previewPath: `/app/workspace/${id}/preview`,
  };
}

export function createWorkspaceService(database: AppDatabase) {
  const { Document, Project, Workspace } = database.models;

  async function ensurePersonalWorkspace(userId: number, transaction: Transaction) {
    const [workspace] = await Workspace.findOrCreate({
      where: { ownerId: userId, type: "personal" },
      defaults: { ownerId: userId, name: "个人空间", type: "personal" },
      transaction,
    });
    return workspace;
  }

  async function createForUser(userId: number, payload: { title: string; description?: string }) {
    return database.sequelize.transaction(async (transaction) => {
      const workspace = await ensurePersonalWorkspace(userId, transaction);
      const project = await Project.create(
        {
          workspaceId: workspace.get("id"),
          ownerId: userId,
          title: payload.title,
          description: payload.description ?? null,
          status: "draft",
          slideCount: 0,
          accent: "blue",
        },
        { transaction },
      );
      const document = await Document.create(
        { projectId: project.get("id"), ownerId: userId, title: payload.title, content: "" },
        { transaction },
      );
      project.setDataValue("document", document);
      return { project: toProjectDto(project), document: toDocumentDto(document) };
    });
  }

  async function listForUser(userId: number) {
    const projects = await Project.findAll({
      where: { ownerId: userId },
      include: [{ model: Document, as: "document", attributes: ["id"], required: false }],
      order: [["updatedAt", "DESC"]],
    });
    return projects.map(toProjectDto);
  }

  async function findForUser(userId: number, projectId: string) {
    const project = await Project.findOne({
      where: { id: projectId, ownerId: userId },
      include: [{ model: Document, as: "document", attributes: ["id"], required: false }],
    });
    return project ? toProjectDto(project) : null;
  }

  async function updateForUser(userId: number, projectId: string, payload: { title?: string; description?: string }) {
    return database.sequelize.transaction(async (transaction) => {
      const project = await Project.findOne({
        where: { id: projectId, ownerId: userId },
        include: [{ model: Document, as: "document", attributes: ["id"], required: false }],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!project) return null;
      await project.update(
        {
          ...(payload.title !== undefined ? { title: payload.title } : {}),
          ...(payload.description !== undefined ? { description: payload.description } : {}),
        },
        { transaction },
      );
      const document = project.get("document") as Model | null | undefined;
      if (payload.title !== undefined && document) {
        await Document.update(
          { title: payload.title },
          { where: { id: document.get("id"), ownerId: userId }, transaction },
        );
      }
      await project.reload({
        include: [{ model: Document, as: "document", attributes: ["id"], required: false }],
        transaction,
      });
      return toProjectDto(project);
    });
  }

  async function deleteForUser(userId: number, projectId: string) {
    return (await Project.destroy({ where: { id: projectId, ownerId: userId } })) > 0;
  }

  return { createForUser, listForUser, findForUser, updateForUser, deleteForUser };
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>;
