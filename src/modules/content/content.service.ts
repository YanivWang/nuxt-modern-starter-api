/**
 * 文件职责：公开内容用例。
 * 通过 ContentRepository 读写数据、按 locale 折叠双语字段，并在写操作成功后触发 ContentRevalidator。
 */
import type {
  LocalizedNewsArticle,
  LocalizedNewsSummary,
  LocalizedPricingPage,
  NewsArticle,
  SupportedLocale,
} from "./content.contract.js";
import type { ContentRepository } from "./ports/content-repository.port.js";
import type { ContentRevalidator } from "./ports/content-revalidator.port.js";

const SUPPORTED_LOCALES: SupportedLocale[] = ["zh-CN", "en-US"];

export function createContentService(repository: ContentRepository, revalidator: ContentRevalidator) {
  const resolveLocale = (acceptLanguage: string | undefined, queryLocale?: string): SupportedLocale => {
    if (queryLocale && SUPPORTED_LOCALES.includes(queryLocale as SupportedLocale))
      return queryLocale as SupportedLocale;
    return acceptLanguage?.trim().toLowerCase().startsWith("en") ? "en-US" : "zh-CN";
  };

  // 返回类型显式标注为契约推导出的类型：折叠逻辑漏掉或多写一个字段会直接编译失败，
  // 而不是等到 OpenAPI 文档与真实响应对不上时才被人发现。
  const localizeSummary = (article: NewsArticle, locale: SupportedLocale): LocalizedNewsSummary => ({
    slug: article.slug,
    title: article.title[locale],
    description: article.description[locale],
    publishedAt: article.publishedAt,
  });

  const listNews = (locale: SupportedLocale): LocalizedNewsSummary[] =>
    repository.listNews().map((article) => localizeSummary(article, locale));
  const findNews = (slug: string, locale: SupportedLocale): LocalizedNewsArticle | null => {
    const article = repository.findNews(slug);
    return article ? { ...localizeSummary(article, locale), body: article.body[locale] } : null;
  };

  const pricing = (locale: SupportedLocale): LocalizedPricingPage => {
    const source = repository.getPricing();
    return {
      eyebrow: source.eyebrow[locale],
      title: source.title[locale],
      lead: source.lead[locale],
      note: source.note[locale],
      plans: source.plans.map((plan) => ({
        key: plan.key,
        featured: plan.featured,
        ctaPath: plan.ctaPath,
        name: plan.name[locale],
        badge: plan.badge[locale],
        price: plan.price[locale],
        period: plan.period[locale],
        description: plan.description[locale],
        cta: plan.cta[locale],
        features: plan.features[locale],
      })),
      includes: {
        eyebrow: source.includes.eyebrow[locale],
        title: source.includes.title[locale],
        items: source.includes.items[locale],
      },
    };
  };

  const createNews = (article: NewsArticle) => {
    const created = repository.createNews(article);
    if (created) revalidator.revalidateNews(created.slug);
    return created;
  };
  const updateNews = (
    slug: string,
    patch: Partial<Pick<NewsArticle, "title" | "description" | "body" | "publishedAt">>,
  ) => {
    const updated = repository.updateNews(slug, patch);
    if (updated) revalidator.revalidateNews(slug);
    return updated;
  };
  const deleteNews = (slug: string) => {
    const deleted = repository.deleteNews(slug);
    if (deleted) revalidator.revalidateNews(slug);
    return deleted;
  };

  return { resolveLocale, listNews, findNews, pricing, createNews, updateNews, deleteNews };
}

export type ContentService = ReturnType<typeof createContentService>;
