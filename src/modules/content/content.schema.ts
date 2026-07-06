/**
 * 文件职责：公开内容接口入参 schema。
 */
import { z } from "zod";

const localeSchema = z.enum(["zh-CN", "en-US"]);

export const listNewsSchema = z.object({
  query: z.object({
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
    slug: z
      .string({ error: "slug 不能为空" })
      .trim()
      .min(1, "slug 不能为空"),
  }),
  query: z.object({
    locale: localeSchema.optional(),
  }),
});

export type ValidatedListNewsSchema = z.infer<typeof listNewsSchema>;
export type ValidatedGetPricingSchema = z.infer<typeof getPricingSchema>;
export type ValidatedNewsSlugSchema = z.infer<typeof newsSlugSchema>;
