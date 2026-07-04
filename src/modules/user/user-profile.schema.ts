import { z } from "zod";

const nullableStr = z.union([z.string(), z.null()]).optional();

const patchMyProfileBodySchema = z
  .object({
    nickname: nullableStr,
    avatar: nullableStr,
    gender: nullableStr,
    birthday: nullableStr,
    bio: nullableStr,
    address: nullableStr,
    company: nullableStr,
    jobTitle: nullableStr,
    isMarried: z.union([z.boolean(), z.null()]).optional(),
    mom: nullableStr,
    father: nullableStr,
    university: nullableStr,
  })
  .strict()
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
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
