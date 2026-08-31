/**
 * 文件职责：定义 { code, message, data } 成功响应信封的 schema 构造器。
 *
 * OpenAPI 的响应定义和集成测试的响应体校验共用这一份信封，
 * 避免「文档写的信封」和「测试断言的信封」各写一套后悄悄分叉。
 */
import { z } from "zod";

/**
 * 信封 code 固定为字面量 200 而不是任意整数：业务成功时 success() 恒写 200，
 * 前端 assertApiSuccess 也据此判定成功。写成 z.number() 会让契约丢掉这条真实约束。
 */
export function apiEnvelope<T extends z.ZodType>(data: T) {
  return z.object({
    code: z.literal(200),
    message: z.string(),
    data,
  });
}

/** data 为 null 的成功响应：注册、登出与各类删除接口。 */
export const nullDataEnvelopeSchema = apiEnvelope(z.null());

/**
 * 错误响应信封。
 *
 * 与成功信封的区别只有两处：code 是 HTTP 状态码而非恒定的 200（见 utils/response.ts 的 fail），
 * data 恒为 null。写成 schema 而不是在 openapi.ts 里手写一份 JSON，
 * 是为了让集成测试能拿同一份定义去校验真实的错误响应体 —— 否则「文档里的错误形状」
 * 和「服务端真正返回的错误形状」之间同样没有任何东西在把关。
 */
export const errorEnvelopeSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.null(),
});
