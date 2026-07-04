import { Transaction } from "sequelize";

import { sequelize, User, UserProfile } from "../db.js";
import { createHttpError } from "../middlewares/error.middleware.js";
import { trimmedStringFromUnknown } from "../utils/trimmedStringFromUnknown.js";

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

function toDateOnlyString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  return null;
}

function toIsoTime(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  if (typeof v === "string") return v;
  return "";
}

export function userProfileToPlain(row: Model): UserProfilePlain {
  return {
    id: row.get("id") as number,
    userId: row.get("userId") as number,
    nickname: (row.get("nickname") as string | null | undefined) ?? null,
    avatar: (row.get("avatar") as string | null | undefined) ?? null,
    gender: (row.get("gender") as string | null | undefined) ?? null,
    birthday: toDateOnlyString(row.get("birthday")),
    bio: (row.get("bio") as string | null | undefined) ?? null,
    address: (row.get("address") as string | null | undefined) ?? null,
    company: (row.get("company") as string | null | undefined) ?? null,
    jobTitle: (row.get("jobTitle") as string | null | undefined) ?? null,
    isMarried:
      row.get("isMarried") === null || row.get("isMarried") === undefined
        ? null
        : Boolean(row.get("isMarried")),
    mom: (row.get("mom") as string | null | undefined) ?? null,
    father: (row.get("father") as string | null | undefined) ?? null,
    university: (row.get("university") as string | null | undefined) ?? null,
    createdAt: toIsoTime(row.get("createdAt")),
    updatedAt: toIsoTime(row.get("updatedAt")),
  };
}

export async function findUserProfileByUserId(userId: number): Promise<UserProfilePlain | null> {
  const row = await UserProfile.findOne({ where: { userId } });
  if (!row) return null;
  return userProfileToPlain(row);
}

function assertMaxLen(label: string, s: string, max: number) {
  if (s.length > max) {
    throw createHttpError(400, `${label}最多 ${max} 个字符`);
  }
}

export type PatchUserProfileInput = {
  nickname?: string | null;
  avatar?: string | null;
  gender?: string | null;
  birthday?: string | null;
  bio?: string | null;
  address?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  isMarried?: boolean | null;
  mom?: string | null;
  father?: string | null;
  university?: string | null;
};

export async function upsertUserProfileForUser(userId: number, patch: PatchUserProfileInput) {
  const allowedGenders = new Set(["male", "female", "unknown"]);

  const next: Record<string, unknown> = {};

  if (patch.nickname !== undefined) {
    if (patch.nickname === null) {
      next.nickname = null;
    } else {
      const s = trimmedStringFromUnknown(patch.nickname);
      assertMaxLen("昵称", s, 100);
      next.nickname = s.length ? s : null;
    }
  }

  let nextUserAvatar: string | null | undefined;

  if (patch.avatar !== undefined) {
    if (patch.avatar === null) {
      next.avatar = null;
      nextUserAvatar = null;
    } else {
      const s = trimmedStringFromUnknown(patch.avatar);
      assertMaxLen("头像", s, 500);
      next.avatar = s.length ? s : null;
      nextUserAvatar = next.avatar as string | null;
    }
  }

  if (patch.gender !== undefined) {
    if (patch.gender === null) {
      next.gender = null;
    } else {
      const s = trimmedStringFromUnknown(patch.gender);
      if (s && !allowedGenders.has(s)) {
        throw createHttpError(400, "性别须为 male、female 或 unknown");
      }
      next.gender = s.length ? s : null;
    }
  }

  if (patch.birthday !== undefined) {
    if (patch.birthday === null) {
      next.birthday = null;
    } else {
      const s = trimmedStringFromUnknown(patch.birthday);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        throw createHttpError(400, "生日格式须为 YYYY-MM-DD");
      }
      next.birthday = s;
    }
  }

  if (patch.bio !== undefined) {
    if (patch.bio === null) {
      next.bio = null;
    } else {
      const s = typeof patch.bio === "string" ? patch.bio.trim() : "";
      assertMaxLen("个人简介", s, 65535);
      next.bio = s.length ? s : null;
    }
  }

  const str255 = (
    key: "address" | "company" | "jobTitle" | "mom" | "father" | "university",
    label: string,
  ) => {
    const v = patch[key];
    if (v === undefined) return;
    if (v === null) {
      next[key] = null;
      return;
    }
    const s = trimmedStringFromUnknown(v);
    assertMaxLen(label, s, 255);
    next[key] = s.length ? s : null;
  };

  str255("address", "住址");
  str255("company", "公司");
  str255("jobTitle", "职称");
  str255("mom", "母亲");
  str255("father", "父亲");
  str255("university", "大学");

  if (patch.isMarried !== undefined) {
    next.isMarried = patch.isMarried;
  }

  if (Object.keys(next).length === 0) {
    throw createHttpError(400, "至少需要提供一个要更新的字段");
  }

  await sequelize.transaction(async (t) => {
    let row = await UserProfile.findOne({
      where: { userId },
      transaction: t,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!row) {
      row = await UserProfile.create({ userId, ...next } as Record<string, unknown>, {
        transaction: t,
      });
    } else {
      await row.update(next, { transaction: t });
    }

    if (nextUserAvatar !== undefined) {
      await User.update({ avatar: nextUserAvatar }, { where: { id: userId }, transaction: t });
    }
  });

  const updated = await UserProfile.findOne({ where: { userId } });
  if (!updated) {
    throw createHttpError(500, "更新用户资料失败");
  }
  return userProfileToPlain(updated);
}
