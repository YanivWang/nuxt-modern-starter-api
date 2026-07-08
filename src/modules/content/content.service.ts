/**
 * 文件职责：公开内容读取与本地化映射。
 */
import { newsArticles, type NewsArticle, type SupportedLocale } from "./content.data.js";
import { pricingPageContent, type PricingPlan } from "./pricing.data.js";

const SUPPORTED_LOCALES: SupportedLocale[] = ["zh-CN", "en-US"];

export function resolveLocale(acceptLanguage: string | undefined, queryLocale?: string): SupportedLocale {
  if (queryLocale && SUPPORTED_LOCALES.includes(queryLocale as SupportedLocale)) {
    return queryLocale as SupportedLocale;
  }

  const normalized = acceptLanguage?.trim().toLowerCase() ?? "";

  if (normalized.startsWith("en")) {
    return "en-US";
  }

  return "zh-CN";
}

function localizeSummary(article: NewsArticle, locale: SupportedLocale) {
  return {
    slug: article.slug,
    title: article.title[locale],
    description: article.description[locale],
    publishedAt: article.publishedAt,
  };
}

function localizeArticle(article: NewsArticle, locale: SupportedLocale) {
  return {
    ...localizeSummary(article, locale),
    body: article.body[locale],
  };
}

export function listNewsArticles(locale: SupportedLocale) {
  return newsArticles.map((article) => localizeSummary(article, locale));
}

export function findNewsArticle(slug: string, locale: SupportedLocale) {
  const article = newsArticles.find((item) => item.slug === slug);

  if (!article) {
    return null;
  }

  return localizeArticle(article, locale);
}

export function createNewsArticle(input: NewsArticle) {
  if (newsArticles.some((item) => item.slug === input.slug)) {
    return null;
  }

  newsArticles.unshift(input);
  return input;
}

export function updateNewsArticle(
  slug: string,
  patch: Partial<Pick<NewsArticle, "title" | "description" | "body" | "publishedAt">>,
) {
  const article = newsArticles.find((item) => item.slug === slug);

  if (!article) {
    return null;
  }

  if (patch.title) {
    article.title = patch.title;
  }

  if (patch.description) {
    article.description = patch.description;
  }

  if (patch.body) {
    article.body = patch.body;
  }

  if (patch.publishedAt) {
    article.publishedAt = patch.publishedAt;
  }

  return article;
}

export function deleteNewsArticle(slug: string) {
  const index = newsArticles.findIndex((item) => item.slug === slug);

  if (index === -1) {
    return false;
  }

  newsArticles.splice(index, 1);
  return true;
}

function localizePricingPlan(plan: PricingPlan, locale: SupportedLocale) {
  return {
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
  };
}

export function getPricingPage(locale: SupportedLocale) {
  return {
    eyebrow: pricingPageContent.eyebrow[locale],
    title: pricingPageContent.title[locale],
    lead: pricingPageContent.lead[locale],
    note: pricingPageContent.note[locale],
    plans: pricingPageContent.plans.map((plan) => localizePricingPlan(plan, locale)),
    includes: {
      eyebrow: pricingPageContent.includes.eyebrow[locale],
      title: pricingPageContent.includes.title[locale],
      items: pricingPageContent.includes.items[locale],
    },
  };
}
