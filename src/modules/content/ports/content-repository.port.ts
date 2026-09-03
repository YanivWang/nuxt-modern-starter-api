/**
 * 文件职责：声明新闻和定价内容的数据访问能力。
 *
 * 全部方法异步，包括当前由静态常量实现的 getPricing：
 * 这个 Port 存在的意义就是内容源可以换（进程内 → 数据库 → CMS），
 * 留一个同步签名等于把「定价永远在进程内」写进每个调用点，
 * 正是这个抽象本来要避免的耦合。
 */
import type { NewsArticle } from "../content.contract.js";
import type { PricingPageContent } from "../pricing.data.js";

export interface ContentRepository {
  listNews(): Promise<NewsArticle[]>;
  findNews(slug: string): Promise<NewsArticle | null>;
  /** slug 已存在时返回 null，由调用方翻译成 409。 */
  createNews(article: NewsArticle): Promise<NewsArticle | null>;
  updateNews(
    slug: string,
    patch: Partial<Pick<NewsArticle, "title" | "description" | "body" | "publishedAt">>,
  ): Promise<NewsArticle | null>;
  deleteNews(slug: string): Promise<boolean>;
  getPricing(): Promise<PricingPageContent>;
}
