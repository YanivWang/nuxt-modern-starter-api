/**
 * 文件职责：工作台项目用例与 ProjectDto 映射。
 * 创建项目时在同一事务内保证个人 Workspace、Project、Document 一起就绪；查询一律按 ownerId 过滤。
 */
import { toDocumentDto } from "../document/index.js";

import type { AppDatabase } from "../../db/index.js";
import type { Project } from "./project.model.js";
import type { Transaction } from "sequelize";

/** 项目状态。收窄为联合类型，避免 DTO 声明成 string 而让消费方无从校验。 */
export type ProjectStatus = "draft" | "published" | "archived";

/** 卡片主题色。前端据此拼 CSS 类名，取值超出集合会静默渲染成无样式卡片。 */
export type ProjectAccent = "blue" | "green" | "violet" | "amber" | "cyan" | "rose";

export const PROJECT_ACCENTS: readonly ProjectAccent[] = ["blue", "green", "violet", "amber", "cyan", "rose"];

const DEFAULT_ACCENT: ProjectAccent = "blue";
const DEFAULT_STATUS: ProjectStatus = "draft";

/**
 * 注意这里不包含 editPath / previewPath 之类的前端路由字段。
 * 路由表属于前端，后端拼出来的路径既无人消费，又会在前端改路由时变成错误数据。
 */
export type ProjectDto = {
  id: string;
  workspaceId: string;
  documentId: string | null;
  title: string;
  description: string | null;
  status: ProjectStatus;
  slideCount: number;
  accent: ProjectAccent;
  updatedAt: string;
};

export type Pagination = {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type ProjectListResult = {
  projects: ProjectDto[];
  pagination: Pagination;
};

// 列存的是自由文本，历史数据或人工改库都可能落在集合之外；出库时归一化，保证 DTO 与其声明一致。
const toAccent = (value: string): ProjectAccent =>
  (PROJECT_ACCENTS as readonly string[]).includes(value) ? (value as ProjectAccent) : DEFAULT_ACCENT;

const toStatus = (value: string): ProjectStatus =>
  value === "published" || value === "archived" ? value : DEFAULT_STATUS;

export function toProjectDto(project: Project): ProjectDto {
  return {
    id: project.id,
    workspaceId: project.workspaceId,
    documentId: project.document ? project.document.id : null,
    title: project.title,
    description: project.description,
    status: toStatus(project.status),
    slideCount: project.slideCount,
    accent: toAccent(project.accent),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export function createWorkspaceService(database: AppDatabase) {
  const { Document, Project, Workspace } = database.models;
  const documentInclude = [{ model: Document, as: "document", attributes: ["id"], required: false }];

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
          workspaceId: workspace.id,
          ownerId: userId,
          title: payload.title,
          description: payload.description ?? null,
          status: DEFAULT_STATUS,
          slideCount: 0,
          accent: DEFAULT_ACCENT,
        },
        { transaction },
      );
      const document = await Document.create(
        { projectId: project.id, ownerId: userId, title: payload.title, content: "" },
        { transaction },
      );
      project.document = document;
      return { project: toProjectDto(project), document: toDocumentDto(document) };
    });
  }

  /**
   * 分页列出当前用户的项目。
   * 列表接口一律分页：项目数会随使用时间单调增长，无上限的 findAll 迟早会拖垮响应与内存。
   */
  async function listForUser(userId: number, page: { limit: number; offset: number }): Promise<ProjectListResult> {
    const { rows, count } = await Project.findAndCountAll({
      where: { ownerId: userId },
      include: documentInclude,
      order: [["updatedAt", "DESC"]],
      limit: page.limit,
      offset: page.offset,
      // include 了 hasOne 关联时 count 需要 distinct，否则 JOIN 会放大计数。
      distinct: true,
    });
    return {
      projects: rows.map(toProjectDto),
      pagination: {
        total: count,
        limit: page.limit,
        offset: page.offset,
        hasMore: page.offset + rows.length < count,
      },
    };
  }

  async function findForUser(userId: number, projectId: string) {
    const project = await Project.findOne({
      where: { id: projectId, ownerId: userId },
      include: documentInclude,
    });
    return project ? toProjectDto(project) : null;
  }

  async function updateForUser(userId: number, projectId: string, payload: { title?: string; description?: string }) {
    return database.sequelize.transaction(async (transaction) => {
      const project = await Project.findOne({
        where: { id: projectId, ownerId: userId },
        include: documentInclude,
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
      const { document } = project;
      if (payload.title !== undefined && document) {
        await Document.update({ title: payload.title }, { where: { id: document.id, ownerId: userId }, transaction });
      }
      await project.reload({ include: documentInclude, transaction });
      return toProjectDto(project);
    });
  }

  async function deleteForUser(userId: number, projectId: string) {
    return (await Project.destroy({ where: { id: projectId, ownerId: userId } })) > 0;
  }

  return { createForUser, listForUser, findForUser, updateForUser, deleteForUser };
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>;
