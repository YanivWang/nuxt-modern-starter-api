/**
 * 文件职责：定义 Projects 模型。
 * Project 是工作台列表中的产品级容器，对应一份可编辑演示文稿/文档。
 */
import { DataTypes, type Model, type ModelStatic, type Sequelize } from "sequelize";

export function defineProjectModel(sequelize: Sequelize, User: ModelStatic<Model>, Workspace: ModelStatic<Model>) {
  const Project = sequelize.define(
    "Project",
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
    },
    {
      tableName: "Projects",
      indexes: [
        { name: "projects_workspace_updated_idx", fields: ["workspaceId", "updatedAt"] },
        { name: "projects_owner_updated_idx", fields: ["ownerId", "updatedAt"] },
      ],
    },
  );

  Project.belongsTo(User, { foreignKey: "ownerId", onDelete: "CASCADE", as: "owner" });
  Project.belongsTo(Workspace, { foreignKey: "workspaceId", onDelete: "CASCADE", as: "workspace" });
  User.hasMany(Project, { foreignKey: "ownerId", as: "projects" });
  Workspace.hasMany(Project, { foreignKey: "workspaceId", as: "projects" });

  return Project;
}
