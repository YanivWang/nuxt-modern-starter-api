/**
 * 文件职责：读取对外可展示的用户基础资料。
 * 返回值会剔除 password，并把 Users.avatar 与 UserProfiles.nickname 合并成 /api/me 所需结构。
 */
import type { AppDatabase } from "../../db/index.js";
import type { PublicUserProfile } from "./user.contract.js";

export type { PublicUserProfile } from "./user.contract.js";

/** 当前用户资料：无记录时返回 null（如 JWT 仍有效但库已重置/用户已删） */
export function createUserService(database: AppDatabase) {
  const { User, UserProfile } = database.models;

  async function findPublicProfileById(id: number): Promise<PublicUserProfile | null> {
    const user = await User.findByPk(id, {
      include: [
        {
          model: UserProfile,
          as: "userProfile",
          attributes: ["nickname"],
          required: false,
        },
      ],
    });
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      nickname: user.userProfile?.nickname ?? null,
    };
  }

  return { findPublicProfileById };
}

export type UserService = ReturnType<typeof createUserService>;
