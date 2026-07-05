/**
 * 文件职责：文档接口入参 schema。
 */
import { z } from "zod";

export const documentIdParamsSchema = z.object({
  params: z.object({
    documentId: z.string().uuid("documentId 必须是 UUID"),
  }),
});

export const patchDocumentSchema = z.object({
  params: documentIdParamsSchema.shape.params,
  body: z.object({
    title: z.string().trim().min(1, "文档标题不能为空").max(160, "文档标题最多 160 个字符").optional(),
    content: z.string().max(10_000_000, "文档内容过大").optional(),
  }),
});

export type ValidatedDocumentIdParamsSchema = z.infer<typeof documentIdParamsSchema>;
export type ValidatedPatchDocumentSchema = z.infer<typeof patchDocumentSchema>;
