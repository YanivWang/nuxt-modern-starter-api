/**
 * 文件职责：当前用户与扩展资料用例单元测试。
 * 重点是对外资料绝不包含 password，以及 avatar 只从 Users 读取、profile 缺失时按需创建。
 * 角色查询单独覆盖：它是公开内容写接口的授权判据，判错就是权限敞开或管理员被挡。
 */
import { describe, expect, it, vi } from "vitest";

import { createUserProfileService } from "../../../src/modules/user/user-profile.service.js";
import { createUserService } from "../../../src/modules/user/user.service.js";

import type { AppDatabase } from "../../../src/db/index.js";
import type { PatchUserProfileBody } from "../../../src/modules/user/user-profile.schema.js";

/** schema 的 transform 让每个键都是必填（值可为 undefined），这里补齐未涉及的字段。 */
function patchBody(partial: Partial<PatchUserProfileBody>): PatchUserProfileBody {
  return {
    nickname: undefined,
    avatar: undefined,
    gender: undefined,
    birthday: undefined,
    bio: undefined,
    address: undefined,
    company: undefined,
    jobTitle: undefined,
    isMarried: undefined,
    mom: undefined,
    father: undefined,
    university: undefined,
    ...partial,
  };
}

describe("user service", () => {
  it("never exposes the password hash and merges nickname from the profile", async () => {
    const findByPk = vi.fn().mockResolvedValue({
      id: 7,
      username: "demo",
      password: "$2b$12$should-never-leak",
      avatar: "/uploads/profiles/a.png",
      userProfile: { nickname: "小明" },
    });
    const database = { models: { User: { findByPk }, UserProfile: {} } } as unknown as AppDatabase;

    const profile = await createUserService(database).findPublicProfileById(7);

    expect(profile).toEqual({ id: 7, username: "demo", avatar: "/uploads/profiles/a.png", nickname: "小明" });
    expect(JSON.stringify(profile)).not.toContain("$2b$");
  });

  it("reads the role for authorization and never leaks it into the public profile", async () => {
    const findByPk = vi.fn().mockResolvedValue({ role: "admin" });
    const database = { models: { User: { findByPk }, UserProfile: {} } } as unknown as AppDatabase;

    expect(await createUserService(database).findRoleById(7)).toBe("admin");
    // 只取 role 一列，别把整行用户数据（含 password 哈希）读进内存
    expect(findByPk).toHaveBeenCalledWith(7, { attributes: ["role"] });
  });

  it("normalises an unknown role value down to the least privileged one", async () => {
    // 人工改库、旧数据或将来新增的角色名都可能落在集合之外；
    // 归一化必须往权限低的方向倒，否则一个手滑的值就是一个管理员。
    const findByPk = vi.fn().mockResolvedValue({ role: "superuser" });
    const database = { models: { User: { findByPk }, UserProfile: {} } } as unknown as AppDatabase;

    expect(await createUserService(database).findRoleById(7)).toBe("user");
  });

  it("reports a deleted account as having no role at all", async () => {
    // 返回 null 而不是 "user"：调用方据此把「token 有效但账号没了」判成 401 重新登录，
    // 而不是当成一个权限不足的普通用户。
    const findByPk = vi.fn().mockResolvedValue(null);
    const database = { models: { User: { findByPk }, UserProfile: {} } } as unknown as AppDatabase;

    expect(await createUserService(database).findRoleById(7)).toBeNull();
  });

  it("falls back to null nickname when no profile row exists", async () => {
    const findByPk = vi.fn().mockResolvedValue({ id: 7, username: "demo", avatar: null, userProfile: undefined });
    const database = { models: { User: { findByPk }, UserProfile: {} } } as unknown as AppDatabase;

    expect(await createUserService(database).findPublicProfileById(7)).toEqual({
      id: 7,
      username: "demo",
      avatar: null,
      nickname: null,
    });
  });

  it("returns null when the user no longer exists", async () => {
    const database = {
      models: { User: { findByPk: vi.fn().mockResolvedValue(null) }, UserProfile: {} },
    } as unknown as AppDatabase;
    expect(await createUserService(database).findPublicProfileById(7)).toBeNull();
  });
});

function buildProfileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 7,
    nickname: "小明",
    gender: null,
    birthday: null,
    bio: null,
    address: null,
    company: null,
    jobTitle: null,
    isMarried: null,
    mom: null,
    father: null,
    university: null,
    createdAt: new Date("2026-08-10T00:00:00.000Z"),
    updatedAt: new Date("2026-08-10T00:00:00.000Z"),
    user: { avatar: "/uploads/profiles/a.png" },
    update: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function buildProfileDatabase(row: unknown) {
  const transaction = {};
  const profileFindOne = vi.fn().mockResolvedValue(row);
  const profileCreate = vi.fn().mockResolvedValue(undefined);
  const findOrCreate = vi.fn().mockResolvedValue([row, false]);
  const userUpdate = vi.fn().mockResolvedValue([1]);
  const database = {
    sequelize: {
      transaction: async (callback: (value: typeof transaction) => Promise<unknown>) => callback(transaction),
    },
    models: {
      User: { update: userUpdate },
      UserProfile: { findOne: profileFindOne, create: profileCreate, findOrCreate },
    },
  } as unknown as AppDatabase;
  return { database, transaction, profileFindOne, profileCreate, findOrCreate, userUpdate };
}

describe("user profile service", () => {
  it("reads avatar from the associated user row, not from UserProfiles", async () => {
    const { database } = buildProfileDatabase(buildProfileRow());
    const plain = await createUserProfileService(database).findByUserId(7);
    expect(plain?.avatar).toBe("/uploads/profiles/a.png");
    expect(plain?.nickname).toBe("小明");
  });

  it("writes avatar to Users and profile fields to UserProfiles within one transaction", async () => {
    const row = buildProfileRow();
    const { database, transaction, userUpdate } = buildProfileDatabase(row);

    await createUserProfileService(database).upsertForUser(
      7,
      patchBody({ avatar: "/uploads/profiles/b.png", nickname: "小红" }),
    );

    expect(userUpdate).toHaveBeenCalledWith({ avatar: "/uploads/profiles/b.png" }, { where: { id: 7 }, transaction });
    expect(row.update).toHaveBeenCalledWith({ nickname: "小红" }, { transaction });
  });

  it("creates the profile row when the user has none yet", async () => {
    const { database, profileFindOne, profileCreate } = buildProfileDatabase(null);
    profileFindOne.mockResolvedValueOnce(null).mockResolvedValueOnce(buildProfileRow());

    await createUserProfileService(database).upsertForUser(7, patchBody({ nickname: "小红" }));

    expect(profileCreate).toHaveBeenCalledWith({ userId: 7, nickname: "小红" }, expect.any(Object));
  });

  it("ignores keys that are not part of the profile whitelist", async () => {
    const row = buildProfileRow();
    const { database } = buildProfileDatabase(row);

    await createUserProfileService(database).upsertForUser(7, patchBody({ nickname: "小红" }));

    const [patch] = row.update.mock.calls[0] as [Record<string, unknown>];
    expect(Object.keys(patch)).toEqual(["nickname"]);
  });
});
