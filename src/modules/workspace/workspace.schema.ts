/**
 * 文件职责：工作台项目接口入参 schema。
 */
import { z } from "zod";

export const createProjectSchema = z.object({
  body: z.object({
    title: z
      .string({ error: "项目标题不能为空" })
      .trim()
      .min(1, "项目标题不能为空")
      .max(160, "项目标题最多 160 个字符"),
    description: z.string().trim().max(500, "项目描述最多 500 个字符").optional(),
  }),
});

export const projectIdParamsSchema = z.object({
  params: z.object({
    projectId: z.string().uuid("projectId 必须是 UUID"),
  }),
});

const patchProjectBodySchema = z
  .object({
    title: z
      .string({ error: "项目标题不能为空" })
      .trim()
      .min(1, "项目标题不能为空")
      .max(160, "项目标题最多 160 个字符")
      .optional(),
    description: z.string().trim().max(500, "项目描述最多 500 个字符").optional(),
  })
  .refine((body) => body.title !== undefined || body.description !== undefined, {
    message: "至少需要提供一个要更新的字段",
  });

export const patchProjectSchema = z.object({
  params: projectIdParamsSchema.shape.params,
  body: patchProjectBodySchema,
});

export type ValidatedCreateProjectSchema = z.infer<typeof createProjectSchema>;
export type ValidatedProjectIdParamsSchema = z.infer<typeof projectIdParamsSchema>;
export type ValidatedPatchProjectSchema = z.infer<typeof patchProjectSchema>;
