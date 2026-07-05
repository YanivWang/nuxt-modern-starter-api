/**
 * 文件职责：创建产品基础域表。
 * Workspaces -> Projects -> Documents 支撑真实工作台、项目和编辑器保存读取。
 */
import { DataTypes } from "sequelize";

import type { QueryInterface } from "sequelize";
import type { MigrationFn } from "umzug";

async function tableExists(context: QueryInterface, tableName: string) {
  const tables = (await context.showAllTables()) as Array<string | { tableName: string }>;
  return tables.some((table) => (typeof table === "string" ? table === tableName : table.tableName === tableName));
}

async function indexExists(context: QueryInterface, tableName: string, indexName: string) {
  const indexes = (await context.showIndex(tableName)) as Array<{ name?: string }>;
  return indexes.some((index) => index.name === indexName);
}

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  if (!(await tableExists(context, "Workspaces"))) {
    await context.createTable("Workspaces", {
      id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
      },
      ownerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "personal",
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    });
  }

  if (!(await indexExists(context, "Workspaces", "workspaces_owner_type_unique"))) {
    await context.addIndex("Workspaces", ["ownerId", "type"], {
      unique: true,
      name: "workspaces_owner_type_unique",
    });
  }

  if (!(await tableExists(context, "Projects"))) {
    await context.createTable("Projects", {
      id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
      },
      workspaceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Workspaces", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      ownerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      title: {
        type: DataTypes.STRING(160),
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "draft",
      },
      slideCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      accent: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "blue",
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    });
  }

  if (!(await indexExists(context, "Projects", "projects_workspace_updated_idx"))) {
    await context.addIndex("Projects", ["workspaceId", "updatedAt"], { name: "projects_workspace_updated_idx" });
  }
  if (!(await indexExists(context, "Projects", "projects_owner_updated_idx"))) {
    await context.addIndex("Projects", ["ownerId", "updatedAt"], { name: "projects_owner_updated_idx" });
  }

  if (!(await tableExists(context, "Documents"))) {
    await context.createTable("Documents", {
      id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
      },
      projectId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Projects", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      ownerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      title: {
        type: DataTypes.STRING(160),
        allowNull: false,
      },
      content: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    });
  }

  if (!(await indexExists(context, "Documents", "documents_project_unique"))) {
    await context.addIndex("Documents", ["projectId"], { unique: true, name: "documents_project_unique" });
  }
  if (!(await indexExists(context, "Documents", "documents_owner_updated_idx"))) {
    await context.addIndex("Documents", ["ownerId", "updatedAt"], { name: "documents_owner_updated_idx" });
  }
};

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.dropTable("Documents");
  await context.dropTable("Projects");
  await context.dropTable("Workspaces");
};
