/**
 * 文件职责：定义 NewsArticles 模型。
 * 公开新闻的持久化实体，双语字段以 JSON 列整体存放。
 */
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

import type { SupportedLocale } from "./content.contract.js";

/** 与契约里的 NewsArticle 字段同形；模型只负责存取，不做 locale 折叠。 */
export type LocalizedText = Record<SupportedLocale, string>;
export type LocalizedParagraphs = Record<SupportedLocale, string[]>;

export class NewsArticleModel extends Model<
  InferAttributes<NewsArticleModel>,
  InferCreationAttributes<NewsArticleModel>
> {
  declare id: CreationOptional<number>;
  declare slug: string;
  declare title: LocalizedText;
  declare description: LocalizedText;
  declare body: LocalizedParagraphs;
  declare publishedAt: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function defineNewsArticleModel(sequelize: Sequelize) {
  NewsArticleModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      slug: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      title: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      description: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      body: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      // 见迁移 20260903100000：契约把 publishedAt 当不透明字符串，不能用日期类型。
      publishedAt: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: "NewsArticle",
      tableName: "NewsArticles",
      indexes: [
        { unique: true, name: "news_articles_slug_unique", fields: ["slug"] },
        { name: "news_articles_published_idx", fields: ["publishedAt", "createdAt"] },
      ],
    },
  );

  return NewsArticleModel;
}
