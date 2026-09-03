/**
 * 文件职责：公开内容接口入参 schema。
 */
import { z } from "zod";

// 入参 schema 直接复用 content.contract.ts 的实体定义：
// 新闻写接口提交的就是双语原文本身，两边各写一份只会在改字段时漏改一边。
import {
  localizedBodySchema,
  localizedTextSchema,
  newsArticleSchema,
  slugValueSchema,
  supportedLocaleSchema as localeSchema,
} from "./content.contract.js";
import { paginationQuerySchema } from "../../shared/http/pagination.js";

// 分页参数复用全站统一的 limit/offset 约定，不在内容模块另立一套：
// 各模块各写一份的话，limit 上限这类保护迟早会有某个端点漏掉。
export const listNewsSchema = z.object({
  query: paginationQuerySchema.extend({
    locale: localeSchema.optional(),
  }),
});

export const getPricingSchema = z.object({
  query: z.object({
    locale: localeSchema.optional(),
  }),
});

export const newsSlugSchema = z.object({
  params: z.object({
    slug: slugValueSchema,
  }),
  query: z.object({
    locale: localeSchema.optional(),
  }),
});

export const createNewsSchema = z.object({
  body: newsArticleSchema,
});

const patchNewsBodySchema = z
  .object({
    title: localizedTextSchema.optional(),
    description: localizedTextSchema.optional(),
    body: localizedBodySchema.optional(),
    publishedAt: z.string().trim().min(1, "发布时间不能为空").optional(),
  })
  .refine(
    (body) =>
      body.title !== undefined ||
      body.description !== undefined ||
      body.body !== undefined ||
      body.publishedAt !== undefined,
    {
      message: "至少需要提供一个要更新的字段",
    },
  );

export const patchNewsSchema = z.object({
  params: newsSlugSchema.shape.params,
  body: patchNewsBodySchema,
});

export type ValidatedListNewsSchema = z.infer<typeof listNewsSchema>;
export type ValidatedGetPricingSchema = z.infer<typeof getPricingSchema>;
export type ValidatedNewsSlugSchema = z.infer<typeof newsSlugSchema>;
export type ValidatedCreateNewsSchema = z.infer<typeof createNewsSchema>;
export type ValidatedPatchNewsSchema = z.infer<typeof patchNewsSchema>;
