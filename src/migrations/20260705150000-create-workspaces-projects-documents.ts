/**
 * 文件职责：创建产品基础域表。
 * Workspaces -> Projects -> Documents 支撑真实工作台、项目和编辑器保存读取。
 */
import { DataTypes } from "sequelize";

import type { QueryInterface } from "sequelize";
import type { MigrationFn } from "umzug";

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
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

  await context.addIndex("Workspaces", ["ownerId", "type"], {
    unique: true,
    name: "workspaces_owner_type_unique",
  });

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

  await context.addIndex("Projects", ["workspaceId", "updatedAt"], { name: "projects_workspace_updated_idx" });
  await context.addIndex("Projects", ["ownerId", "updatedAt"], { name: "projects_owner_updated_idx" });

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

  await context.addIndex("Documents", ["projectId"], { unique: true, name: "documents_project_unique" });
  await context.addIndex("Documents", ["ownerId", "updatedAt"], { name: "documents_owner_updated_idx" });
};

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.dropTable("Documents");
  await context.dropTable("Projects");
  await context.dropTable("Workspaces");
};
