/**
 * 文件职责：签发 access token，并以数据库会话方式管理 refresh token。
 * refresh token 只保存 SHA-256 摘要，刷新时会创建新 token 并撤销旧 token。
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";

import jwt from "jsonwebtoken";
import { Op } from "sequelize";

import { User, UserRefreshToken } from "../../db.js";
import { ACCESS_TOKEN_TTL_SECONDS, JWT_SECRET, REFRESH_TOKEN_TTL_SECONDS } from "../../env.js";
import { createHttpError } from "../../middlewares/error.middleware.js";

type TokenContext = {
  userAgent?: string;
  ipAddress?: string;
};

type UserLike = {
  get(key: "id" | "username"): unknown;
};

export type AuthTokenPair = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
};

function tokenHash(token: string): string {
  // Refresh token 只保存哈希，数据库泄露时不会直接暴露可用的长期凭证。
  return createHash("sha256").update(token).digest("hex");
}

function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

function signAccessToken(user: UserLike): string {
  return jwt.sign(
    {
      id: user.get("id") as number,
      username: user.get("username") as string,
    },
    JWT_SECRET,
    {
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      jwtid: randomUUID(),
    },
  );
}

async function createRefreshToken(userId: number, context: TokenContext = {}): Promise<string> {
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  await UserRefreshToken.create({
    userId,
    tokenHash: tokenHash(refreshToken),
    expiresAt,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
  });

  return refreshToken;
}

export async function createAuthTokenPair(user: UserLike, context: TokenContext = {}): Promise<AuthTokenPair> {
  const userId = user.get("id") as number;
  const accessToken = signAccessToken(user);
  const refreshToken = await createRefreshToken(userId, context);

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
  };
}

export async function rotateRefreshToken(refreshToken: string, context: TokenContext = {}): Promise<AuthTokenPair> {
  const oldHash = tokenHash(refreshToken);
  const session = await UserRefreshToken.findOne({
    where: {
      tokenHash: oldHash,
      revokedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
  });

  if (!session) {
    throw createHttpError(401, "refresh token 无效或已过期");
  }

  const user = await User.findByPk(session.get("userId") as number);
  if (!user) {
    // 用户被删除后，旧 refresh 会话不再有合法主体，立即撤销以免后续重复命中。
    await session.update({ revokedAt: new Date() });
    throw createHttpError(401, "refresh token 无效或已过期");
  }

  const nextRefreshToken = generateRefreshToken();
  const nextHash = tokenHash(nextRefreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  await UserRefreshToken.create({
    userId: user.get("id") as number,
    tokenHash: nextHash,
    expiresAt,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
  });
  // 先写入新 token，再撤销旧 token 并记录替代关系；客户端若重放旧 token 会命中 revokedAt。
  await session.update({
    revokedAt: new Date(),
    replacedByTokenHash: nextHash,
  });

  return {
    accessToken: signAccessToken(user),
    refreshToken: nextRefreshToken,
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
  };
}

export async function revokeRefreshToken(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  await UserRefreshToken.update(
    { revokedAt: new Date() },
    {
      where: {
        tokenHash: tokenHash(refreshToken),
        revokedAt: null,
      },
    },
  );
}
