/**
 * 文件职责：当前用户基础接口的 Zod schema。
 * GET /api/me 不接收业务入参，此 schema 用于保持 validate/getValidated 链路一致。
 */
import { z } from "zod";

/** GET /me：无查询参数；仅配合 authMiddleware 使用 */
export const getMeSchema = z.object({
  body: z.unknown(),
  query: z.unknown(),
  params: z.unknown(),
});

export type ValidatedGetMeSchema = z.infer<typeof getMeSchema>;
