/**
 * 文件职责：认证接口的 Zod 入参 schema。
 * 同一份 schema 同时用于运行时 validate 中间件和 OpenAPI 请求体生成。
 */
import { z } from "zod";

const usernameSchema = z
  .string({ error: "用户名不能为空" })
  .trim()
  .min(2, "用户名最小长度2个汉字")
  .max(100, "用户名最多 100 个字符");

// bcrypt 只取密码的前 72 字节，超出部分会被静默截断——两个前 72 字节相同的长密码会等价。
// 与其让用户以为自己设了很长的密码，不如在入口显式拒绝。
const bcryptByteLimit = (value: string) => Buffer.byteLength(value, "utf8") <= 72;

/** 注册：按现代口令强度要求设置下限。 */
const registerPasswordSchema = z
  .string({ error: "密码不能为空" })
  .trim()
  .min(8, "密码最小长度8个字符")
  .refine(bcryptByteLimit, "密码不能超过 72 字节");

/**
 * 登录：只校验非空，不复用注册的长度下限。
 * 提高注册强度要求不应把已经存在的短密码用户挡在门外——那会变成一次静默的账号封禁。
 */
const loginPasswordSchema = z
  .string({ error: "密码不能为空" })
  .trim()
  .min(1, "密码不能为空")
  .refine(bcryptByteLimit, "密码不能超过 72 字节");

export const registerSchema = z.object({
  body: z.object({
    username: usernameSchema,
    password: registerPasswordSchema,
  }),
});

export const loginSchema = z.object({
  body: z.object({
    username: usernameSchema,
    password: loginPasswordSchema,
  }),
});

export const refreshSchema = z.object({
  body: z
    .object({
      refreshToken: z.string().trim().min(1, "refreshToken 不能为空").optional(),
    })
    .optional(),
});

export const logoutSchema = z.object({
  body: z
    .object({
      refreshToken: z.string().trim().min(1, "refreshToken 不能为空").optional(),
    })
    .optional(),
});

export type ValidatedRegisterSchema = z.infer<typeof registerSchema>;
export type ValidatedLoginSchema = z.infer<typeof loginSchema>;
export type ValidatedRefreshSchema = z.infer<typeof refreshSchema>;
export type ValidatedLogoutSchema = z.infer<typeof logoutSchema>;
