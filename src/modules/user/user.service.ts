/**
 * 文件职责：读取对外可展示的用户基础资料。
 * 返回值会剔除 password，并把 Users.avatar 与 UserProfiles.nickname 合并成 /api/me 所需结构。
 */
import { toUserRole } from "./user.contract.js";

import type { AppDatabase } from "../../db/index.js";
import type { PublicUserProfile, UserRole } from "./user.contract.js";

export type { PublicUserProfile, UserRole } from "./user.contract.js";

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

  /**
   * 读取账号角色，供授权中间件使用。
   *
   * 每次请求查一次库，而不是把角色塞进 JWT：token 里的角色在签发那一刻就固化了，
   * 撤销一个管理员之后他手上的 access token 仍然是管理员，直到自然过期（默认 15 分钟）。
   * 需要授权的只有内容写接口这几条低频路径，这一次查询的代价可以忽略。
   */
  async function findRoleById(id: number): Promise<UserRole | null> {
    const user = await User.findByPk(id, { attributes: ["role"] });
    return user ? toUserRole(user.role) : null;
  }

  return { findPublicProfileById, findRoleById };
}

export type UserService = ReturnType<typeof createUserService>;
