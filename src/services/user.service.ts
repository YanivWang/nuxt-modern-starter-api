import { User, UserProfile } from "../db.js";

import type { Model } from "sequelize";

/** 对外展示：不含 password */
export type PublicUserProfile = {
  id: number;
  username: string;
  avatar: string | null;
  nickname: string | null;
};

function toPublicProfile(user: Model): Omit<PublicUserProfile, "nickname"> {
  return {
    id: user.get("id") as number,
    username: user.get("username") as string,
    avatar: (user.get("avatar") as string | null | undefined) ?? null,
  };
}

/** 当前用户资料：无记录时返回 null（如 JWT 仍有效但库已重置/用户已删） */
export async function findPublicProfileById(id: number): Promise<PublicUserProfile | null> {
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
  const base = toPublicProfile(user);
  const up = user.get("userProfile") as Model | null | undefined;
  let nickname: string | null = null;
  if (up && typeof up.get === "function") {
    nickname = (up.get("nickname") as string | null | undefined) ?? null;
  }
  return { ...base, nickname };
}
