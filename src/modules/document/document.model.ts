/**
 * 文件职责：定义 Documents 模型。
 * Document 保存编辑器内容，是后续版本历史、协作、导出能力的基础实体。
 */
import { DataTypes, type Model, type ModelStatic, type Sequelize } from "sequelize";

export function defineDocumentModel(sequelize: Sequelize, User: ModelStatic<Model>, Project: ModelStatic<Model>) {
  const Document = sequelize.define(
    "Document",
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
    },
    {
      tableName: "Documents",
      indexes: [
        { unique: true, name: "documents_project_unique", fields: ["projectId"] },
        { name: "documents_owner_updated_idx", fields: ["ownerId", "updatedAt"] },
      ],
    },
  );

  Document.belongsTo(User, { foreignKey: "ownerId", onDelete: "CASCADE", as: "owner" });
  Document.belongsTo(Project, { foreignKey: "projectId", onDelete: "CASCADE", as: "project" });
  User.hasMany(Document, { foreignKey: "ownerId", as: "documents" });
  Project.hasOne(Document, { foreignKey: "projectId", as: "document" });

  return Document;
}
