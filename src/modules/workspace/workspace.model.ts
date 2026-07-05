/**
 * 文件职责：定义 Workspaces 模型。
 * Workspaces 是后续团队、组织、协作能力的基础边界；当前阶段为每个用户创建默认个人空间。
 */
import { DataTypes, type Model, type ModelStatic, type Sequelize } from "sequelize";

export function defineWorkspaceModel(sequelize: Sequelize, User: ModelStatic<Model>) {
  const Workspace = sequelize.define(
    "Workspace",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      ownerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "空间所有者 Users.id",
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
    },
    {
      tableName: "Workspaces",
      indexes: [{ unique: true, name: "workspaces_owner_type_unique", fields: ["ownerId", "type"] }],
    },
  );

  Workspace.belongsTo(User, { foreignKey: "ownerId", onDelete: "CASCADE", as: "owner" });
  User.hasMany(Workspace, { foreignKey: "ownerId", as: "workspaces" });

  return Workspace;
}
