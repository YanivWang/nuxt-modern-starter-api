/**
 * 文件职责：文档保存用例单元测试。
 * 验证归属过滤、行锁事务，以及标题变更同步回关联 Project。
 */
import { describe, expect, it, vi } from "vitest";

import { createDocumentService } from "../../../src/modules/document/document.service.js";

import type { AppDatabase } from "../../../src/db/index.js";

function buildDatabase(document: unknown) {
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  const findOne = vi.fn().mockResolvedValue(document);
  const projectUpdate = vi.fn().mockResolvedValue([1]);
  const database = {
    sequelize: {
      transaction: async (callback: (value: typeof transaction) => Promise<unknown>) => callback(transaction),
    },
    models: { Document: { findOne }, Project: { update: projectUpdate } },
  } as unknown as AppDatabase;
  return { database, transaction, findOne, projectUpdate };
}

function buildDocument() {
  return {
    id: "doc-1",
    projectId: "project-1",
    title: "旧标题",
    content: "旧内容",
    updatedAt: new Date("2026-08-10T00:00:00.000Z"),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

describe("document service", () => {
  it("scopes reads to the owner", async () => {
    const { database, findOne } = buildDatabase(null);
    expect(await createDocumentService(database).findForUser(7, "doc-1")).toBeNull();
    expect(findOne).toHaveBeenCalledWith({ where: { id: "doc-1", ownerId: 7 } });
  });

  it("returns null instead of updating when the document belongs to someone else", async () => {
    const { database, projectUpdate } = buildDatabase(null);
    expect(await createDocumentService(database).updateForUser(7, "doc-1", { title: "新" })).toBeNull();
    expect(projectUpdate).not.toHaveBeenCalled();
  });

  it("takes a row lock and syncs the new title back to the project", async () => {
    const document = buildDocument();
    const { database, transaction, findOne, projectUpdate } = buildDatabase(document);

    const dto = await createDocumentService(database).updateForUser(7, "doc-1", { title: "新标题" });

    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ transaction, lock: "UPDATE" }));
    expect(document.update).toHaveBeenCalledWith({ title: "新标题", content: "旧内容" }, { transaction });
    expect(projectUpdate).toHaveBeenCalledWith(
      { title: "新标题" },
      { where: { id: "project-1", ownerId: 7 }, transaction },
    );
    expect(dto?.id).toBe("doc-1");
  });

  it("keeps the existing values for fields the patch omits", async () => {
    const document = buildDocument();
    const { database } = buildDatabase(document);

    await createDocumentService(database).updateForUser(7, "doc-1", { content: "新内容" });

    expect(document.update).toHaveBeenCalledWith({ title: "旧标题", content: "新内容" }, expect.any(Object));
  });
});
