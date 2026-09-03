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

/**
 * 列表最多返回的条数。
 *
 * 换成数据库表之后行数不再是源码里写死的四条，而 `GET /content/news` 的响应体
 * 没有分页参数 —— 不设上限就是「表能长多大，响应就能多大」。
 * 取最新 N 条是内容站列表的常规做法，且不改动现有响应形状。
 * 新闻量真的越过这个数量级时，应该给这个端点加分页（`GET /projects` 已经是这么做的），
 * 而不是把这里调大。
 */
const LIST_LIMIT = 100;

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
    async listNews() {
      const rows = await NewsArticle.findAll({
        order: LIST_ORDER.map((entry) => [...entry]),
        limit: LIST_LIMIT,
      });
      return rows.map(toArticle);
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
