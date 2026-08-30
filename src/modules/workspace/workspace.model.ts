/**
 * 文件职责：定义 Workspaces 模型。
 * Workspaces 是后续团队、组织、协作能力的基础边界；当前阶段为每个用户创建默认个人空间。
 */
import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

import type { User } from "../user/user.model.js";

export class Workspace extends Model<InferAttributes<Workspace>, InferCreationAttributes<Workspace>> {
  declare id: CreationOptional<string>;
  declare ownerId: ForeignKey<number>;
  declare name: string;
  declare type: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function defineWorkspaceModel(sequelize: Sequelize, UserModel: typeof User) {
  Workspace.init(
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
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: "Workspace",
      tableName: "Workspaces",
      indexes: [{ unique: true, name: "workspaces_owner_type_unique", fields: ["ownerId", "type"] }],
    },
  );

  Workspace.belongsTo(UserModel, { foreignKey: "ownerId", onDelete: "CASCADE", as: "owner" });
  UserModel.hasMany(Workspace, { foreignKey: "ownerId", as: "workspaces" });

  return Workspace;
}
