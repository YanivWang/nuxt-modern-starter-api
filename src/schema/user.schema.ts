import { z } from "zod";

/** GET /me：无查询参数；仅配合 authMiddleware 使用 */
export const getMeSchema = z.object({
  body: z.unknown(),
  query: z.unknown(),
  params: z.unknown(),
});

export type ValidatedGetMeSchema = z.infer<typeof getMeSchema>;
