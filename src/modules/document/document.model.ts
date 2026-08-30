/**
 * 文件职责：定义 Documents 模型。
 * Document 保存编辑器内容，是后续版本历史、协作、导出能力的基础实体。
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
import type { Project } from "../workspace/project.model.js";

export class Document extends Model<InferAttributes<Document>, InferCreationAttributes<Document>> {
  declare id: CreationOptional<string>;
  declare projectId: ForeignKey<string>;
  declare ownerId: ForeignKey<number>;
  declare title: string;
  declare content: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function defineDocumentModel(sequelize: Sequelize, UserModel: typeof User, ProjectModel: typeof Project) {
  Document.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      projectId: {
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
      content: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
        defaultValue: "",
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: "Document",
      tableName: "Documents",
      indexes: [
        { unique: true, name: "documents_project_unique", fields: ["projectId"] },
        { name: "documents_owner_updated_idx", fields: ["ownerId", "updatedAt"] },
      ],
    },
  );

  Document.belongsTo(UserModel, { foreignKey: "ownerId", onDelete: "CASCADE", as: "owner" });
  Document.belongsTo(ProjectModel, { foreignKey: "projectId", onDelete: "CASCADE", as: "project" });
  UserModel.hasMany(Document, { foreignKey: "ownerId", as: "documents" });
  ProjectModel.hasOne(Document, { foreignKey: "projectId", as: "document" });

  return Document;
}
