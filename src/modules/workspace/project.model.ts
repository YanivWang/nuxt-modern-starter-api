/**
 * 文件职责：定义 Projects 模型。
 * Project 是工作台列表中的产品级容器，对应一份可编辑演示文稿/文档。
 */
import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from "sequelize";

import type { Document } from "../document/document.model.js";
import type { User } from "../user/user.model.js";
import type { Workspace } from "./workspace.model.js";

export class Project extends Model<InferAttributes<Project>, InferCreationAttributes<Project>> {
  declare id: CreationOptional<string>;
  declare workspaceId: ForeignKey<string>;
  declare ownerId: ForeignKey<number>;
  declare title: string;
  declare description: CreationOptional<string | null>;
  declare status: CreationOptional<string>;
  declare slideCount: CreationOptional<number>;
  declare accent: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  /** include({ as: "document" }) 时填充。 */
  declare document?: NonAttribute<Document | null>;
}

export function defineProjectModel(sequelize: Sequelize, UserModel: typeof User, WorkspaceModel: typeof Workspace) {
  Project.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      workspaceId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      ownerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
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
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: "Project",
      tableName: "Projects",
      indexes: [
        { name: "projects_workspace_updated_idx", fields: ["workspaceId", "updatedAt"] },
        { name: "projects_owner_updated_idx", fields: ["ownerId", "updatedAt"] },
      ],
    },
  );

  Project.belongsTo(UserModel, { foreignKey: "ownerId", onDelete: "CASCADE", as: "owner" });
  Project.belongsTo(WorkspaceModel, { foreignKey: "workspaceId", onDelete: "CASCADE", as: "workspace" });
  UserModel.hasMany(Project, { foreignKey: "ownerId", as: "projects" });
  WorkspaceModel.hasMany(Project, { foreignKey: "workspaceId", as: "projects" });

  return Project;
}
