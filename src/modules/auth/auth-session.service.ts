import { createHash, randomBytes, randomUUID } from "node:crypto";

import jwt from "jsonwebtoken";
import { Op } from "sequelize";

import { ACCESS_TOKEN_TTL_SECONDS, JWT_SECRET, REFRESH_TOKEN_TTL_SECONDS } from "../../env.js";
import { unauthorized } from "../../shared/errors/app-error.js";

import type { AppDatabase } from "../../db/index.js";
import type { Model, Transaction } from "sequelize";

type TokenContext = {
  userAgent?: string;
  ipAddress?: string;
};

type UserLike = Pick<Model, "get">;

export type AuthTokenPair = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
};

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const generateRefreshToken = () => randomBytes(48).toString("base64url");

function signAccessToken(user: UserLike): string {
  return jwt.sign({ id: user.get("id") as number, username: user.get("username") as string }, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    jwtid: randomUUID(),
  });
}

export function createAuthSessionService(database: AppDatabase) {
  const { User, UserRefreshToken } = database.models;

  async function createRefreshToken(userId: number, context: TokenContext, transaction?: Transaction) {
    const refreshToken = generateRefreshToken();
    await UserRefreshToken.create(
      {
        userId,
        tokenHash: tokenHash(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
      },
      { transaction },
    );
    return refreshToken;
  }

  async function createTokenPair(user: UserLike, context: TokenContext = {}): Promise<AuthTokenPair> {
    const refreshToken = await createRefreshToken(user.get("id") as number, context);
    return {
      accessToken: signAccessToken(user),
      refreshToken,
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
    };
  }

  async function rotate(refreshToken: string, context: TokenContext = {}): Promise<AuthTokenPair> {
    return database.sequelize.transaction(async (transaction) => {
      const session = await UserRefreshToken.findOne({
        where: {
          tokenHash: tokenHash(refreshToken),
          revokedAt: null,
          expiresAt: { [Op.gt]: new Date() },
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!session) throw unauthorized("refresh token 无效或已过期");

      const user = await User.findByPk(session.get("userId") as number, { transaction });
      if (!user) {
        await session.update({ revokedAt: new Date() }, { transaction });
        throw unauthorized("refresh token 无效或已过期");
      }

      const nextRefreshToken = await createRefreshToken(user.get("id") as number, context, transaction);
      await session.update(
        { revokedAt: new Date(), replacedByTokenHash: tokenHash(nextRefreshToken) },
        { transaction },
      );

      return {
        accessToken: signAccessToken(user),
        refreshToken: nextRefreshToken,
        accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
        refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
      };
    });
  }

  async function revoke(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await UserRefreshToken.update(
      { revokedAt: new Date() },
      { where: { tokenHash: tokenHash(refreshToken), revokedAt: null } },
    );
  }

  return { createTokenPair, rotate, revoke };
}

export type AuthSessionService = ReturnType<typeof createAuthSessionService>;
