import { z } from "zod";

const credentialsBodySchema = z.object({
  username: z
    .string({ error: "用户名不能为空" })
    .trim()
    .min(2, "用户名最小长度2个汉字")
    .max(100, "用户名最多 100 个字符"),
  password: z
    .string({ error: "密码不能为空" })
    .trim()
    .min(6, "密码最小长度6个字符")
    .max(100, "密码最多 100 个字符"),
});

export const registerSchema = z.object({
  body: credentialsBodySchema,
});

export const loginSchema = z.object({
  body: credentialsBodySchema,
});

export type ValidatedRegisterSchema = z.infer<typeof registerSchema>;
export type ValidatedLoginSchema = z.infer<typeof loginSchema>;
