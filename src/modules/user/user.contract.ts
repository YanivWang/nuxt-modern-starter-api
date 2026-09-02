/**
 * 文件职责：定义当前用户与扩展资料的响应契约。
 *
 * 头像只存在 Users.avatar 一处，/me 与 /me/profile 读取时都从那里合并出来，
 * 因此两个 schema 里的 avatar 是同一份数据的两种投影，不是两个字段。
 */
import { z } from "zod";

import { apiEnvelope } from "../../shared/http/api-envelope.js";

/**
 * 账号角色。
 *
 * 只有 admin 能写公开内容（新闻）。它刻意不出现在 publicUserSchema 里：
 * /me 是给前端渲染用户信息的，把角色下发给浏览器只会诱导前端拿它做权限判断，
 * 而客户端的判断从来不是授权 —— 授权在服务端按每次请求查库完成。
 */
export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** 库里存的是自由文本，人工改库可能落在集合之外；出库时按最小权限归一化。 */
export const toUserRole = (value: string): UserRole => (value === "admin" ? "admin" : "user");

/** 对外展示的用户基础资料：一定不含 password。 */
export const publicUserSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  avatar: z.string().nullable(),
  nickname: z.string().nullable(),
});

export type PublicUserProfile = z.infer<typeof publicUserSchema>;

/**
 * 扩展资料的可空字段一律显式 nullable 而不是 optional：
 * 服务端把未填写的列统一归一化成 null 后下发，字段本身始终存在。
 * 写成 optional 会让消费方以为需要区分「没这个字段」和「字段为空」两种情况。
 */
export const userProfileSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  nickname: z.string().nullable(),
  avatar: z.string().nullable(),
  gender: z.string().nullable(),
  birthday: z.string().nullable(),
  bio: z.string().nullable(),
  address: z.string().nullable(),
  company: z.string().nullable(),
  jobTitle: z.string().nullable(),
  isMarried: z.boolean().nullable(),
  mom: z.string().nullable(),
  father: z.string().nullable(),
  university: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type UserProfilePlain = z.infer<typeof userProfileSchema>;

export const meEnvelopeSchema = apiEnvelope(z.object({ user: publicUserSchema }));

/** GET /me/profile 在用户从未填写过资料时返回 profile: null，PATCH 之后必定非空。 */
export const profileEnvelopeSchema = apiEnvelope(z.object({ profile: userProfileSchema.nullable() }));

export const updatedProfileEnvelopeSchema = apiEnvelope(z.object({ profile: userProfileSchema }));
