/**
 * 文件职责：管理当前用户扩展资料。
 * 资料字段写入 UserProfiles；头像仅存 Users.avatar，读取时通过关联合并返回。
 */
import { Transaction } from "sequelize";

import { internalError } from "../../shared/errors/app-error.js";

import type { PatchUserProfileBody } from "./user-profile.schema.js";
import type { AppDatabase } from "../../db/index.js";
import type { Model } from "sequelize";

export type UserProfilePlain = {
  id: number;
  userId: number;
  nickname: string | null;
  avatar: string | null;
  gender: string | null;
  birthday: string | null;
  bio: string | null;
  address: string | null;
  company: string | null;
  jobTitle: string | null;
  isMarried: boolean | null;
  mom: string | null;
  father: string | null;
  university: string | null;
  createdAt: string;
  updatedAt: string;
};

function toDateOnlyString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

function toIsoTime(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
}

function userAvatarFromRow(row: Model): string | null {
  const user = row.get("user") as Model | null | undefined;
  return user ? ((user.get("avatar") as string | null | undefined) ?? null) : null;
}

export function userProfileToPlain(row: Model): UserProfilePlain {
  return {
    id: row.get("id") as number,
    userId: row.get("userId") as number,
    nickname: (row.get("nickname") as string | null | undefined) ?? null,
    avatar: userAvatarFromRow(row),
    gender: (row.get("gender") as string | null | undefined) ?? null,
    birthday: toDateOnlyString(row.get("birthday")),
    bio: (row.get("bio") as string | null | undefined) ?? null,
    address: (row.get("address") as string | null | undefined) ?? null,
    company: (row.get("company") as string | null | undefined) ?? null,
    jobTitle: (row.get("jobTitle") as string | null | undefined) ?? null,
    isMarried:
      row.get("isMarried") === null || row.get("isMarried") === undefined ? null : Boolean(row.get("isMarried")),
    mom: (row.get("mom") as string | null | undefined) ?? null,
    father: (row.get("father") as string | null | undefined) ?? null,
    university: (row.get("university") as string | null | undefined) ?? null,
    createdAt: toIsoTime(row.get("createdAt")),
    updatedAt: toIsoTime(row.get("updatedAt")),
  };
}

export function createUserProfileService(database: AppDatabase) {
  const { User, UserProfile } = database.models;
  const profileInclude = [{ model: User, as: "user", attributes: ["avatar"], required: false }];

  async function findByUserId(userId: number): Promise<UserProfilePlain | null> {
    const row = await UserProfile.findOne({ where: { userId }, include: profileInclude });
    return row ? userProfileToPlain(row) : null;
  }

  async function upsertForUser(userId: number, patch: PatchUserProfileBody) {
    const profilePatch: Record<string, unknown> = {};
    const profileKeys = [
      "nickname",
      "gender",
      "birthday",
      "bio",
      "address",
      "company",
      "jobTitle",
      "isMarried",
      "mom",
      "father",
      "university",
    ] as const;

    for (const key of profileKeys) {
      if (patch[key] !== undefined) {
        profilePatch[key] = patch[key];
      }
    }

    const avatarPatch = patch.avatar;

    await database.sequelize.transaction(async (transaction) => {
      if (avatarPatch !== undefined) {
        await User.update({ avatar: avatarPatch }, { where: { id: userId }, transaction });
      }

      if (Object.keys(profilePatch).length > 0) {
        const row = await UserProfile.findOne({
          where: { userId },
          transaction,
          lock: Transaction.LOCK.UPDATE,
        });

        if (!row) {
          await UserProfile.create({ userId, ...profilePatch } as Record<string, unknown>, { transaction });
        } else {
          await row.update(profilePatch, { transaction });
        }
      } else if (avatarPatch !== undefined) {
        await UserProfile.findOrCreate({
          where: { userId },
          defaults: { userId },
          transaction,
        });
      }
    });

    const updated = await UserProfile.findOne({ where: { userId }, include: profileInclude });
    if (!updated) {
      throw internalError("更新用户资料失败");
    }

    return userProfileToPlain(updated);
  }

  return { findByUserId, upsertForUser };
}

export type UserProfileService = ReturnType<typeof createUserProfileService>;
