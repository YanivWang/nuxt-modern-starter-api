/**
 * 文件职责：refresh token 轮换与重放检测单元测试。
 * 用假 database 验证轮换发生在同一事务 + 行锁内，以及已撤销 token 被重放时整个家族会被撤销。
 */
import { describe, expect, it, vi } from "vitest";

import { createAuthSessionService } from "../../../src/modules/auth/auth-session.service.js";

import type { AppDatabase } from "../../../src/db/index.js";

type SessionRow = {
  userId: number;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  update: ReturnType<typeof vi.fn>;
};

function buildDatabase(session: SessionRow | null) {
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  const user = { id: 7, username: "demo" };
  const findOne = vi.fn().mockResolvedValue(session);
  const create = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn().mockResolvedValue([1]);
  const findByPk = vi.fn().mockResolvedValue(user);
  const database = {
    sequelize: {
      transaction: async (callback: (value: typeof transaction) => Promise<unknown>) => callback(transaction),
    },
    models: { UserRefreshToken: { findOne, create, update }, User: { findByPk } },
  } as unknown as AppDatabase;
  return { database, transaction, findOne, create, update, findByPk };
}

function activeSession(): SessionRow {
  return {
    userId: 7,
    familyId: "family-1",
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    update: vi.fn().mockResolvedValue(undefined),
  };
}

describe("auth session service", () => {
  it("rotates refresh tokens inside one locked transaction", async () => {
    const session = activeSession();
    const { database, transaction, findOne, create, findByPk } = buildDatabase(session);

    const pair = await createAuthSessionService(database).rotate("old-refresh-token");

    expect(pair.refreshToken).not.toBe("old-refresh-token");
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ transaction, lock: "UPDATE" }));
    expect(findByPk).toHaveBeenCalledWith(7, { transaction });
    expect(create).toHaveBeenCalledWith(expect.any(Object), { transaction });
    expect(session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        revokedAt: expect.any(Date) as Date,
        revokedReason: "rotated",
        replacedByTokenHash: expect.any(String) as string,
      }),
      { transaction },
    );
  });

  it("keeps the new token in the same family so a later replay can revoke the whole chain", async () => {
    const session = activeSession();
    const { database, create } = buildDatabase(session);

    await createAuthSessionService(database).rotate("old-refresh-token");

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ familyId: "family-1" }), expect.any(Object));
  });

  it("revokes the entire family when an already-revoked token is replayed", async () => {
    const session = { ...activeSession(), revokedAt: new Date() };
    const { database, update, create } = buildDatabase(session);

    await expect(createAuthSessionService(database).rotate("stolen-token")).rejects.toThrow(
      "refresh token 无效或已过期",
    );

    // 关键断言：不只是拒绝本次请求，攻击者此前换到的新 token 也必须一并失效。
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ revokedReason: "replay_detected" }),
      expect.objectContaining({ where: { familyId: "family-1", revokedAt: null } }),
    );
    // 撤销必须发生在事务之外：在事务回调里抛错会让 Sequelize 回滚，撤销写入会被一并撤回。
    const [, options] = update.mock.calls[0] as [unknown, { transaction?: unknown }];
    expect(options.transaction).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an expired refresh token without issuing a new pair", async () => {
    const session = { ...activeSession(), expiresAt: new Date(Date.now() - 1_000) };
    const { database, create } = buildDatabase(session);

    await expect(createAuthSessionService(database).rotate("expired-token")).rejects.toThrow(
      "refresh token 无效或已过期",
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an unknown refresh token", async () => {
    const { database, create } = buildDatabase(null);

    await expect(createAuthSessionService(database).rotate("unknown-token")).rejects.toThrow(
      "refresh token 无效或已过期",
    );
    expect(create).not.toHaveBeenCalled();
  });
});
