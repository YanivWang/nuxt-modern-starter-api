/**
 * 文件职责：工作台项目用例的事务边界与分页单元测试。
 * 验证 Workspace、Project、Document 的写入都传入同一个 transaction，以及列表接口按分页参数查询。
 */
import { describe, expect, it, vi } from "vitest";

import { createWorkspaceService } from "../../../src/modules/workspace/workspace.service.js";

import type { AppDatabase } from "../../../src/db/index.js";

const UPDATED_AT = new Date("2026-08-10T00:00:00.000Z");

function buildDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: "document-1",
    projectId: "project-1",
    title: "Demo",
    content: "",
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function buildProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "project-1",
    workspaceId: "workspace-1",
    title: "Demo",
    description: null,
    status: "draft",
    slideCount: 0,
    accent: "blue",
    updatedAt: UPDATED_AT,
    document: undefined as unknown,
    ...overrides,
  };
}

describe("workspace service", () => {
  it("creates workspace, project and document in the same transaction", async () => {
    const transaction = {};
    const workspace = { id: "workspace-1" };
    const document = buildDocument();
    const project = buildProject();
    const findOrCreate = vi.fn().mockResolvedValue([workspace, true]);
    const createProject = vi.fn().mockResolvedValue(project);
    const createDocument = vi.fn().mockResolvedValue(document);
    const database = {
      sequelize: {
        transaction: async (callback: (value: typeof transaction) => Promise<unknown>) => callback(transaction),
      },
      models: {
        Workspace: { findOrCreate },
        Project: { create: createProject },
        Document: { create: createDocument },
      },
    } as unknown as AppDatabase;

    const result = await createWorkspaceService(database).createForUser(7, { title: "Demo" });

    expect(findOrCreate).toHaveBeenCalledWith(expect.objectContaining({ transaction }));
    expect(createProject).toHaveBeenCalledWith(expect.any(Object), { transaction });
    expect(createDocument).toHaveBeenCalledWith(expect.any(Object), { transaction });
    expect(result.project.documentId).toBe("document-1");
    expect(result.project.editPath).toBe("/app/workspace/project-1/edit");
  });

  it("passes limit and offset through to the query and reports pagination", async () => {
    const findAndCountAll = vi.fn().mockResolvedValue({ rows: [buildProject()], count: 42 });
    const database = {
      models: { Project: { findAndCountAll }, Document: {}, Workspace: {} },
    } as unknown as AppDatabase;

    const result = await createWorkspaceService(database).listForUser(7, { limit: 20, offset: 20 });

    expect(findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 7 }, limit: 20, offset: 20, distinct: true }),
    );
    expect(result.pagination).toEqual({ total: 42, limit: 20, offset: 20, hasMore: true });
    expect(result.projects).toHaveLength(1);
  });

  it("reports hasMore=false on the last page", async () => {
    const findAndCountAll = vi.fn().mockResolvedValue({ rows: [buildProject()], count: 21 });
    const database = {
      models: { Project: { findAndCountAll }, Document: {}, Workspace: {} },
    } as unknown as AppDatabase;

    const result = await createWorkspaceService(database).listForUser(7, { limit: 20, offset: 20 });

    expect(result.pagination.hasMore).toBe(false);
  });

  it("scopes every read to the owner so cross-user access is impossible at the query level", async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    const database = { models: { Project: { findOne }, Document: {}, Workspace: {} } } as unknown as AppDatabase;

    const found = await createWorkspaceService(database).findForUser(7, "project-1");

    expect(found).toBeNull();
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "project-1", ownerId: 7 } }));
  });
});
