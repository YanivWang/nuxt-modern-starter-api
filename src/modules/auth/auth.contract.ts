/**
 * 文件职责：定义认证模块对外的响应契约。
 *
 * schema 是唯一来源：AuthTokenPair 由它推导，OpenAPI 的响应定义也由它生成。
 * 手写一份类型再手写一份文档 schema，两者迟早分叉，而分叉时没有任何一侧会报错。
 */
import { z } from "zod";

import { apiEnvelope } from "../../shared/http/api-envelope.js";

export const authTokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** 秒；前端据此安排提前刷新，不要改成毫秒或 ISO 字符串。 */
  accessTokenExpiresIn: z.number().int().positive(),
  refreshTokenExpiresIn: z.number().int().positive(),
});

export type AuthTokenPair = z.infer<typeof authTokenPairSchema>;

/**
 * 登录/刷新的响应体不含 token 字段别名：历史上前端曾同时读 token 和 accessToken，
 * 别名一旦存在就会有人依赖它，之后再想删就是破坏性变更。
 */
export const authTokenPairEnvelopeSchema = apiEnvelope(authTokenPairSchema);
