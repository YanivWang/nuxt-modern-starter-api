/**
 * 文件职责：签发 access token 并管理 refresh token 会话。
 * refresh token 只以 SHA-256 摘要落库；轮换在同一事务 + 行锁内完成，旧会话记录 revokedAt 与替代摘要。
 *
 * 重放检测（OAuth 2.0 Security BCP）：一次登录派生出的所有轮换 token 共享同一个 familyId。
 * 若某个已撤销的 refresh token 再次被使用，说明该 token 已泄露且攻击者与真实用户在竞争同一条链，
 * 此时仅拒绝本次请求是不够的——攻击者手中的新 token 仍然有效。因此必须撤销整个家族，强制重新登录。
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";

import jwt from "jsonwebtoken";
import { Op } from "sequelize";

import { ACCESS_TOKEN_TTL_SECONDS, JWT_SECRET, REFRESH_TOKEN_TTL_SECONDS } from "../../env.js";
import { unauthorized } from "../../shared/errors/app-error.js";
import { logger } from "../../utils/logger.js";

import type { AuthTokenPair } from "./auth.contract.js";
import type { RefreshTokenRevokedReason } from "./user-refresh-token.model.js";
import type { AppDatabase } from "../../db/index.js";
import type { User } from "../user/user.model.js";
import type { Transaction } from "sequelize";

type TokenContext = {
  userAgent?: string;
  ipAddress?: string;
};

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const generateRefreshToken = () => randomBytes(48).toString("base64url");

function signAccessToken(user: User): string {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    jwtid: randomUUID(),
  });
}

export function createAuthSessionService(database: AppDatabase) {
  const { User, UserRefreshToken } = database.models;

  async function createRefreshToken(
    userId: number,
    familyId: string,
    context: TokenContext,
    transaction?: Transaction,
  ) {
    const refreshToken = generateRefreshToken();
    await UserRefreshToken.create(
      {
        userId,
        familyId,
        tokenHash: tokenHash(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
        userAgent: context.userAgent ?? null,
        ipAddress: context.ipAddress ?? null,
      },
      { transaction },
    );
    return refreshToken;
  }

  /** 撤销整个 token 家族中所有尚未撤销的会话。 */
  async function revokeFamily(
    familyId: string,
    reason: RefreshTokenRevokedReason,
    transaction?: Transaction,
  ): Promise<number> {
    const [affected] = await UserRefreshToken.update(
      { revokedAt: new Date(), revokedReason: reason },
      { where: { familyId, revokedAt: null }, transaction },
    );
    return affected;
  }

  async function createTokenPair(user: User, context: TokenContext = {}): Promise<AuthTokenPair> {
    // 每次登录开启一条新的 token 家族链。
    const refreshToken = await createRefreshToken(user.id, randomUUID(), context);
    return {
      accessToken: signAccessToken(user),
      refreshToken,
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
    };
  }

  /**
   * 轮换的判定在事务内完成，但「撤销家族」必须在事务外单独提交。
   * 拒绝本次请求要靠抛错，而在事务回调里抛错会让 Sequelize 回滚整个事务——
   * 撤销写入会被一并撤回，攻击者手上的新 token 反而毫发无损。
   */
  type RotateOutcome =
    | { kind: "ok"; pair: AuthTokenPair }
    | { kind: "reject" }
    | { kind: "revoke_family"; familyId: string; userId: number; reason: RefreshTokenRevokedReason };

  async function rotate(refreshToken: string, context: TokenContext = {}): Promise<AuthTokenPair> {
    const outcome: RotateOutcome = await database.sequelize.transaction(async (transaction) => {
      // 先按摘要取出会话（不过滤 revokedAt），否则无法区分“token 不存在”与“token 已被使用过”。
      const session = await UserRefreshToken.findOne({
        where: { tokenHash: tokenHash(refreshToken) },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!session) return { kind: "reject" };

      if (session.revokedAt !== null) {
        return {
          kind: "revoke_family",
          familyId: session.familyId,
          userId: session.userId,
          reason: "replay_detected",
        };
      }

      if (session.expiresAt.getTime() <= Date.now()) return { kind: "reject" };

      const user = await User.findByPk(session.userId, { transaction });
      if (!user) {
        return { kind: "revoke_family", familyId: session.familyId, userId: session.userId, reason: "user_missing" };
      }

      // 轮换后的新 token 继承家族，使整条链在检测到重放时可以被一次性撤销。
      const nextRefreshToken = await createRefreshToken(user.id, session.familyId, context, transaction);
      await session.update(
        { revokedAt: new Date(), revokedReason: "rotated", replacedByTokenHash: tokenHash(nextRefreshToken) },
        { transaction },
      );

      return {
        kind: "ok",
        pair: {
          accessToken: signAccessToken(user),
          refreshToken: nextRefreshToken,
          accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
          refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
        },
      };
    });

    if (outcome.kind === "ok") return outcome.pair;

    if (outcome.kind === "revoke_family") {
      const revoked = await revokeFamily(outcome.familyId, outcome.reason);
      if (outcome.reason === "replay_detected") {
        logger.warn("refresh_token_replay_detected", {
          userId: outcome.userId,
          familyId: outcome.familyId,
          revokedSessions: revoked,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });
      }
    }

    throw unauthorized("refresh token 无效或已过期");
  }

  /** 登出：撤销该 refresh token 所属的整个家族，使这台设备的会话链整体失效。 */
  async function revoke(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const session = await UserRefreshToken.findOne({ where: { tokenHash: tokenHash(refreshToken) } });
    if (!session) return;
    await revokeFamily(session.familyId, "logout");
  }

  /** 清理已过期或已撤销且超过保留期的会话行，避免表无限增长。 */
  async function purgeExpired(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    return UserRefreshToken.destroy({
      where: {
        [Op.or]: [{ expiresAt: { [Op.lt]: cutoff } }, { revokedAt: { [Op.lt]: cutoff } }],
      },
    });
  }

  return { createTokenPair, rotate, revoke, revokeFamily, purgeExpired };
}

export type AuthSessionService = ReturnType<typeof createAuthSessionService>;
