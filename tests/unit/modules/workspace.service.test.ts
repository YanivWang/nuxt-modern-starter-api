import { describe, expect, it, vi } from "vitest";

import { createWorkspaceService } from "../../../src/modules/workspace/workspace.service.js";

import type { AppDatabase } from "../../../src/db/index.js";

describe("workspace service", () => {
  it("creates workspace, project and document in the same transaction", async () => {
    const transaction = {};
    const workspace = { get: vi.fn(() => "workspace-1") };
    const documentValues = {
      id: "document-1",
      projectId: "project-1",
      title: "Demo",
      content: "",
      updatedAt: new Date("2026-08-10T00:00:00.000Z"),
    };
    const document = { get: vi.fn((key: keyof typeof documentValues) => documentValues[key]) };
    let linkedDocument: typeof document | undefined;
    const projectValues = {
      id: "project-1",
      workspaceId: "workspace-1",
      title: "Demo",
      description: null,
      status: "draft",
      slideCount: 0,
      accent: "blue",
      updatedAt: new Date("2026-08-10T00:00:00.000Z"),
    };
    const project = {
      get: vi.fn((key: keyof typeof projectValues | "document") =>
        key === "document" ? linkedDocument : projectValues[key],
      ),
      setDataValue: vi.fn((_key: string, value: typeof document) => {
        linkedDocument = value;
      }),
    };
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

    await createWorkspaceService(database).createForUser(7, { title: "Demo" });

    expect(findOrCreate).toHaveBeenCalledWith(expect.objectContaining({ transaction }));
    expect(createProject).toHaveBeenCalledWith(expect.any(Object), { transaction });
    expect(createDocument).toHaveBeenCalledWith(expect.any(Object), { transaction });
  });
});
