/** 文件职责：声明新闻和定价内容的数据访问能力。 */
import type { NewsArticle } from "../content.contract.js";
import type { PricingPageContent } from "../pricing.data.js";

export interface ContentRepository {
  listNews(): NewsArticle[];
  findNews(slug: string): NewsArticle | null;
  createNews(article: NewsArticle): NewsArticle | null;
  updateNews(
    slug: string,
    patch: Partial<Pick<NewsArticle, "title" | "description" | "body" | "publishedAt">>,
  ): NewsArticle | null;
  deleteNews(slug: string): boolean;
  getPricing(): PricingPageContent;
}
