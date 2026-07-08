/**
 * 文件职责：公开内容接口入参 schema。
 */
import { z } from "zod";

const localeSchema = z.enum(["zh-CN", "en-US"]);

const localizedTextSchema = z.object({
  "zh-CN": z
    .string({ error: "中文标题不能为空" })
    .trim()
    .min(1, "中文标题不能为空"),
  "en-US": z
    .string({ error: "英文标题不能为空" })
    .trim()
    .min(1, "英文标题不能为空"),
});

const localizedBodySchema = z.object({
  "zh-CN": z.array(z.string().trim().min(1, "中文段落不能为空")).min(1, "中文正文至少一段"),
  "en-US": z.array(z.string().trim().min(1, "英文段落不能为空")).min(1, "英文正文至少一段"),
});

const slugValueSchema = z
  .string({ error: "slug 不能为空" })
  .trim()
  .min(1, "slug 不能为空")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug 只能包含小写字母、数字和连字符");

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
    slug: slugValueSchema,
  }),
  query: z.object({
    locale: localeSchema.optional(),
  }),
});

export const createNewsSchema = z.object({
  body: z.object({
    slug: slugValueSchema,
    title: localizedTextSchema,
    description: localizedTextSchema,
    body: localizedBodySchema,
    publishedAt: z
      .string({ error: "发布时间不能为空" })
      .trim()
      .min(1, "发布时间不能为空"),
  }),
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
