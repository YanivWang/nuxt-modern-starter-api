/**
 * 文件职责：定义工作台项目的响应契约。
 *
 * ProjectDto 由 schema 推导，OpenAPI 也从同一份 schema 生成。
 * 这一层存在的直接原因：曾经把列表响应从 { projects } 改成 { projects, pagination }，
 * 而契约里 data 是空的 {}，两侧都没有任何自动化能报警，最后靠人读代码才发现。
 */
import { z } from "zod";

import { documentDtoSchema } from "../document/document.contract.js";
import { apiEnvelope } from "../../shared/http/api-envelope.js";
import { paginationSchema } from "../../shared/http/pagination.js";

/** 项目状态。收窄为枚举，避免 DTO 声明成 string 而让消费方无从校验。 */
export const projectStatusSchema = z.enum(["draft", "published", "archived"]);

export type ProjectStatus = z.infer<typeof projectStatusSchema>;

/** 卡片主题色。前端据此拼 CSS 类名，取值超出集合会静默渲染成无样式卡片。 */
export const projectAccentSchema = z.enum(["blue", "green", "violet", "amber", "cyan", "rose"]);

export type ProjectAccent = z.infer<typeof projectAccentSchema>;

export const PROJECT_ACCENTS: readonly ProjectAccent[] = projectAccentSchema.options;

/**
 * 注意这里不包含 editPath / previewPath 之类的前端路由字段。
 * 路由表属于前端，后端拼出来的路径既无人消费，又会在前端改路由时变成错误数据。
 */
export const projectDtoSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  /** 关联文档 id；项目尚未建文档时为 null。 */
  documentId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: projectStatusSchema,
  slideCount: z.number().int().nonnegative(),
  accent: projectAccentSchema,
  updatedAt: z.string(),
});

export type ProjectDto = z.infer<typeof projectDtoSchema>;

export const projectListSchema = z.object({
  projects: z.array(projectDtoSchema),
  pagination: paginationSchema,
});

export type ProjectListResult = z.infer<typeof projectListSchema>;

export const projectListEnvelopeSchema = apiEnvelope(projectListSchema);

export const projectEnvelopeSchema = apiEnvelope(z.object({ project: projectDtoSchema }));

/** 创建项目会在同一事务里初始化文档，因此响应同时带回两者，前端无需再发一次请求。 */
export const projectCreatedEnvelopeSchema = apiEnvelope(
  z.object({ project: projectDtoSchema, document: documentDtoSchema }),
);
