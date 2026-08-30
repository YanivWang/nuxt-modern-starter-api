/**
 * 文件职责：定义全站统一的分页入参约定与响应结构。
 * 所有列表接口共用同一份 limit/offset 语义和上限，避免各模块各写一套分页参数。
 */
import { z } from "zod";

/** 未显式指定 limit 时返回的条数。 */
export const DEFAULT_PAGE_LIMIT = 20;

/** 单页条数硬上限：防止客户端用 limit=100000 把分页退化成全表扫描。 */
export const MAX_PAGE_LIMIT = 100;

export const paginationQuerySchema = z.object({
  limit: z.coerce
    .number({ error: "limit 须为整数" })
    .int("limit 须为整数")
    .min(1, "limit 至少为 1")
    .max(MAX_PAGE_LIMIT, `limit 最大为 ${MAX_PAGE_LIMIT}`)
    .optional()
    .default(DEFAULT_PAGE_LIMIT),
  offset: z.coerce
    .number({ error: "offset 须为整数" })
    .int("offset 须为整数")
    .min(0, "offset 不能为负")
    .optional()
    .default(0),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
