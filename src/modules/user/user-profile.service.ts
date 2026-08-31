/**
 * 文件职责：管理当前用户扩展资料。
 * 资料字段写入 UserProfiles；头像仅存 Users.avatar，读取时通过关联合并返回。
 */
import { Transaction } from "sequelize";

import { internalError } from "../../shared/errors/app-error.js";

import type { UserProfile } from "./user-profile.model.js";
import type { UserProfilePlain } from "./user.contract.js";
import type { PatchUserProfileBody } from "./user-profile.schema.js";
import type { AppDatabase } from "../../db/index.js";

export type { UserProfilePlain } from "./user.contract.js";

/** UserProfiles 上可被 PATCH 直接写入的字段（avatar 不在此列，它属于 Users）。 */
const PROFILE_KEYS = [
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

type ProfilePatch = Partial<Pick<PatchUserProfileBody, (typeof PROFILE_KEYS)[number]>>;

export function userProfileToPlain(row: UserProfile): UserProfilePlain {
  return {
    id: row.id,
    userId: row.userId,
    nickname: row.nickname ?? null,
    avatar: row.user?.avatar ?? null,
    gender: row.gender ?? null,
    birthday: row.birthday ?? null,
    bio: row.bio ?? null,
    address: row.address ?? null,
    company: row.company ?? null,
    jobTitle: row.jobTitle ?? null,
    isMarried: row.isMarried ?? null,
    mom: row.mom ?? null,
    father: row.father ?? null,
    university: row.university ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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
    const profilePatch: ProfilePatch = {};
    for (const key of PROFILE_KEYS) {
      if (patch[key] !== undefined) {
        Object.assign(profilePatch, { [key]: patch[key] });
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
          await UserProfile.create({ userId, ...profilePatch }, { transaction });
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
