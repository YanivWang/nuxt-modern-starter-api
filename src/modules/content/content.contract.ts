/**
 * 文件职责：定义公开内容的实体契约与响应契约。
 *
 * 新闻实体（双语原文）同时是写接口的入参和写接口的响应体，因此只声明一份 schema，
 * 由 content.schema.ts 复用为请求校验、由 openapi.ts 生成文档。
 *
 * 注意读写两侧的 article 形状并不相同：
 * GET 返回按 locale 折叠后的单语结构，POST/PATCH 返回未折叠的双语原文。
 * 这是刻意的——写接口的调用方提交的就是双语原文，回显折叠版会让它无法确认另一语种写没写进去。
 */
import { z } from "zod";

import { apiEnvelope } from "../../shared/http/api-envelope.js";
import { paginationSchema } from "../../shared/http/pagination.js";

export const supportedLocaleSchema = z.enum(["zh-CN", "en-US"]);

export type SupportedLocale = z.infer<typeof supportedLocaleSchema>;

export const localizedTextSchema = z.object({
  "zh-CN": z.string({ error: "中文标题不能为空" }).trim().min(1, "中文标题不能为空"),
  "en-US": z.string({ error: "英文标题不能为空" }).trim().min(1, "英文标题不能为空"),
});

export const localizedBodySchema = z.object({
  "zh-CN": z.array(z.string().trim().min(1, "中文段落不能为空")).min(1, "中文正文至少一段"),
  "en-US": z.array(z.string().trim().min(1, "英文段落不能为空")).min(1, "英文正文至少一段"),
});

export const slugValueSchema = z
  .string({ error: "slug 不能为空" })
  .trim()
  .min(1, "slug 不能为空")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug 只能包含小写字母、数字和连字符");

/** 新闻双语原文：持久化实体、写接口入参与写接口响应共用同一形状。 */
export const newsArticleSchema = z.object({
  slug: slugValueSchema,
  title: localizedTextSchema,
  description: localizedTextSchema,
  body: localizedBodySchema,
  publishedAt: z.string({ error: "发布时间不能为空" }).trim().min(1, "发布时间不能为空"),
});

export type NewsArticle = z.infer<typeof newsArticleSchema>;

/** 列表只给摘要：正文按段落数组存放，列表页带上会让响应体膨胀十几倍。 */
export const localizedNewsSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  publishedAt: z.string(),
});

export const localizedNewsArticleSchema = localizedNewsSummarySchema.extend({
  body: z.array(z.string()),
});

export const pricingPlanKeySchema = z.enum(["starter", "growth", "custom"]);

export type PricingPlanKey = z.infer<typeof pricingPlanKeySchema>;

/** 定价卡片的 CTA 只允许指向站内既有页面，避免内容源写出前端并不存在的路由。 */
export const pricingCtaPathSchema = z.enum(["/sign-up", "/help"]);

export type PricingCtaPath = z.infer<typeof pricingCtaPathSchema>;

export const localizedPricingPlanSchema = z.object({
  key: pricingPlanKeySchema,
  featured: z.boolean(),
  ctaPath: pricingCtaPathSchema,
  name: z.string(),
  badge: z.string(),
  price: z.string(),
  period: z.string(),
  description: z.string(),
  cta: z.string(),
  features: z.array(z.string()),
});

export const localizedPricingPageSchema = z.object({
  eyebrow: z.string(),
  title: z.string(),
  lead: z.string(),
  note: z.string(),
  plans: z.array(localizedPricingPlanSchema),
  includes: z.object({
    eyebrow: z.string(),
    title: z.string(),
    items: z.array(z.string()),
  }),
});

export type LocalizedNewsSummary = z.infer<typeof localizedNewsSummarySchema>;
export type LocalizedNewsArticle = z.infer<typeof localizedNewsArticleSchema>;
export type LocalizedPricingPage = z.infer<typeof localizedPricingPageSchema>;

export const newsListSchema = z.object({
  articles: z.array(localizedNewsSummarySchema),
  pagination: paginationSchema,
});

export type NewsListResult = z.infer<typeof newsListSchema>;

export const newsListEnvelopeSchema = apiEnvelope(newsListSchema);

export const newsArticleEnvelopeSchema = apiEnvelope(z.object({ article: localizedNewsArticleSchema }));

/** 写接口回显双语原文，与读接口的 article 不是同一形状。 */
export const newsSourceEnvelopeSchema = apiEnvelope(z.object({ article: newsArticleSchema }));

export const pricingEnvelopeSchema = apiEnvelope(z.object({ pricing: localizedPricingPageSchema }));
