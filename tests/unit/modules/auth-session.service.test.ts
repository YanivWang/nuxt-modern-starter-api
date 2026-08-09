import { describe, expect, it, vi } from "vitest";

import { createAuthSessionService } from "../../../src/modules/auth/auth-session.service.js";

import type { AppDatabase } from "../../../src/db/index.js";

describe("auth session service", () => {
  it("rotates refresh tokens inside one locked transaction", async () => {
    const transaction = { LOCK: { UPDATE: "UPDATE" } };
    const session = { get: vi.fn().mockReturnValue(7), update: vi.fn().mockResolvedValue(undefined) };
    const user = { get: vi.fn((key: string) => (key === "id" ? 7 : "demo")) };
    const findOne = vi.fn().mockResolvedValue(session);
    const create = vi.fn().mockResolvedValue(undefined);
    const findByPk = vi.fn().mockResolvedValue(user);
    const database = {
      sequelize: {
        transaction: async (callback: (value: typeof transaction) => Promise<unknown>) => callback(transaction),
      },
      models: { UserRefreshToken: { findOne, create }, User: { findByPk } },
    } as unknown as AppDatabase;

    const pair = await createAuthSessionService(database).rotate("old-refresh-token");

    expect(pair.refreshToken).not.toBe("old-refresh-token");
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ transaction, lock: "UPDATE" }));
    expect(findByPk).toHaveBeenCalledWith(7, { transaction });
    expect(create).toHaveBeenCalledWith(expect.any(Object), { transaction });
    expect(session.update).toHaveBeenCalledWith(
      expect.objectContaining({ revokedAt: expect.any(Date), replacedByTokenHash: expect.any(String) }),
      { transaction },
    );
  });
});
