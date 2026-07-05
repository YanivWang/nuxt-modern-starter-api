/**
 * 文件职责：工作区与项目领域服务。
 * 保持 controller 轻量，把默认空间创建、项目聚合和 DTO 转换集中在这里。
 */
import { Document, Project, Workspace, sequelize } from "../../db.js";

import type { Model } from "sequelize";

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

export function toProjectDto(project: Model): ProjectDto {
  const document = project.get("document") as Model | null | undefined;
  const projectId = project.get("id") as string;

  return {
    id: projectId,
    workspaceId: project.get("workspaceId") as string,
    documentId: document ? (document.get("id") as string) : null,
    title: project.get("title") as string,
    description: (project.get("description") as string | null | undefined) ?? null,
    status: project.get("status") as string,
    slideCount: project.get("slideCount") as number,
    accent: project.get("accent") as string,
    updatedAt: toIso(project.get("updatedAt")),
    editPath: `/app/workspace/${projectId}/edit`,
    previewPath: `/app/workspace/${projectId}/preview`,
  };
}

export async function ensurePersonalWorkspace(userId: number) {
  const [workspace] = await Workspace.findOrCreate({
    where: {
      ownerId: userId,
      type: "personal",
    },
    defaults: {
      ownerId: userId,
      name: "个人空间",
      type: "personal",
    },
  });

  return workspace;
}

export async function createProjectForUser(
  userId: number,
  payload: {
    title: string;
    description?: string;
  },
) {
  return sequelize.transaction(async (transaction) => {
    const workspace = await ensurePersonalWorkspace(userId);
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
      {
        projectId: project.get("id"),
        ownerId: userId,
        title: payload.title,
        content: "",
      },
      { transaction },
    );

    project.setDataValue("document", document);

    return {
      project: toProjectDto(project),
      document: toDocumentDto(document),
    };
  });
}

export async function listProjectsForUser(userId: number) {
  const projects = await Project.findAll({
    where: { ownerId: userId },
    include: [{ model: Document, as: "document", attributes: ["id"], required: false }],
    order: [["updatedAt", "DESC"]],
  });

  return projects.map(toProjectDto);
}

export async function findProjectForUser(userId: number, projectId: string) {
  const project = await Project.findOne({
    where: { id: projectId, ownerId: userId },
    include: [{ model: Document, as: "document", attributes: ["id"], required: false }],
  });

  return project ? toProjectDto(project) : null;
}
