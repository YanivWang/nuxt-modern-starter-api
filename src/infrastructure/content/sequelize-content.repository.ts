/**
 * 文件职责：用 Sequelize 实现内容模块的 ContentRepository Port。
 *
 * 新闻走 NewsArticles 表；定价仍来自静态常量 —— 它没有写接口，
 * 是随构建发布的站点配置而不是运营数据，建表只会多一份要同步的副本。
 * Port 是异步的，这里用已解析的 Promise 兑现签名。
 */
import { pricingPageContent } from "../../modules/content/pricing.data.js";

import type { NewsArticle } from "../../modules/content/content.contract.js";
import type { NewsArticleModel } from "../../modules/content/news-article.model.js";
import type { ContentRepository } from "../../modules/content/ports/content-repository.port.js";
import type { UniqueConstraintError } from "sequelize";

type NewsArticleStatic = typeof NewsArticleModel;

/** 列表次序：先按发布日期，同日期再按入库时间，都取新的在前。 */
const LIST_ORDER = [
  ["publishedAt", "DESC"],
  ["createdAt", "DESC"],
] as const;

function toArticle(row: NewsArticleModel): NewsArticle {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    body: row.body,
    publishedAt: row.publishedAt,
  };
}

function isUniqueConstraintError(error: unknown): error is UniqueConstraintError {
  return error instanceof Error && error.name === "SequelizeUniqueConstraintError";
}

export function createSequelizeContentRepository(NewsArticle: NewsArticleStatic): ContentRepository {
  return {
    async listNews({ limit, offset }) {
      // findAndCountAll 而不是先 count 再 findAll：两次独立查询之间表可能被写，
      // 会算出与本页内容对不上的 total，进而让 hasMore 在最后一页出错。
      const { rows, count } = await NewsArticle.findAndCountAll({
        order: LIST_ORDER.map((entry) => [...entry]),
        limit,
        offset,
      });
      return { articles: rows.map(toArticle), total: count };
    },

    async findNews(slug) {
      const row = await NewsArticle.findOne({ where: { slug } });
      return row ? toArticle(row) : null;
    },

    async createNews(article) {
      try {
        const row = await NewsArticle.create(article);
        return toArticle(row);
      } catch (error) {
        // 先查后插会在并发下漏判，唯一索引才是判据；撞索引即视为 slug 已存在。
        if (isUniqueConstraintError(error)) return null;
        throw error;
      }
    },

    async updateNews(slug, patch) {
      const row = await NewsArticle.findOne({ where: { slug } });
      if (!row) return null;
      await row.update(patch);
      return toArticle(row);
    },

    async deleteNews(slug) {
      const removed = await NewsArticle.destroy({ where: { slug } });
      return removed > 0;
    },

    getPricing: () => Promise.resolve(pricingPageContent),
  };
}
