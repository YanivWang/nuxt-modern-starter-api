/**
 * 文件职责：当前用户扩展资料接口的 Zod schema。
 * PATCH body 只允许白名单字段，并要求至少提供一个字段。
 */
import { z } from "zod";

function nullableTrimmedString(label: string, max: number) {
  return z
    .union([z.null(), z.string().trim().max(max, `${label}最多 ${max} 个字符`)])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      return value.length === 0 ? null : value;
    });
}

const patchMyProfileBodySchema = z
  .object({
    nickname: nullableTrimmedString("昵称", 100),
    avatar: nullableTrimmedString("头像", 500),
    gender: z
      .union([z.null(), z.enum(["male", "female", "unknown"], { error: "性别须为 male、female 或 unknown" })])
      .optional(),
    birthday: z
      .union([
        z.null(),
        z
          .string()
          .trim()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "生日格式须为 YYYY-MM-DD"),
      ])
      .optional(),
    bio: nullableTrimmedString("个人简介", 65535),
    address: nullableTrimmedString("住址", 255),
    company: nullableTrimmedString("公司", 255),
    jobTitle: nullableTrimmedString("职称", 255),
    isMarried: z.union([z.boolean(), z.null()]).optional(),
    mom: nullableTrimmedString("母亲", 255),
    father: nullableTrimmedString("父亲", 255),
    university: nullableTrimmedString("大学", 255),
  })
  .strict()
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "至少需要提供一个要更新的字段",
  });

export const getMyProfileSchema = z.object({
  body: z.unknown(),
  query: z.unknown(),
  params: z.unknown(),
});

export const patchMyProfileSchema = z.object({
  body: patchMyProfileBodySchema,
  query: z.unknown(),
  params: z.unknown(),
});

export type ValidatedPatchMyProfileSchema = z.infer<typeof patchMyProfileSchema>;
export type PatchUserProfileBody = z.infer<typeof patchMyProfileBodySchema>;
