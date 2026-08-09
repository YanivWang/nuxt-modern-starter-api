/** 文件职责：用进程内数据实现内容模块的 ContentRepository Port。 */
import { newsArticles } from "../../modules/content/content.data.js";
import { pricingPageContent } from "../../modules/content/pricing.data.js";

import type { ContentRepository } from "../../modules/content/ports/content-repository.port.js";

export function createInMemoryContentRepository(): ContentRepository {
  return {
    listNews: () => newsArticles,
    findNews: (slug) => newsArticles.find((article) => article.slug === slug) ?? null,
    createNews(article) {
      if (newsArticles.some((item) => item.slug === article.slug)) return null;
      newsArticles.unshift(article);
      return article;
    },
    updateNews(slug, patch) {
      const article = newsArticles.find((item) => item.slug === slug);
      if (!article) return null;
      Object.assign(article, patch);
      return article;
    },
    deleteNews(slug) {
      const index = newsArticles.findIndex((item) => item.slug === slug);
      if (index < 0) return false;
      newsArticles.splice(index, 1);
      return true;
    },
    getPricing: () => pricingPageContent,
  };
}
