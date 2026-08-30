/**
 * 文件职责：注册与登录用例单元测试。
 * 重点覆盖账号级失败锁定、用户名枚举防护，以及登录成功后失败计数被清零。
 */
import bcrypt from "bcrypt";
import { describe, expect, it, vi } from "vitest";

import { createAuthService } from "../../../src/modules/auth/auth.service.js";

import type { AppDatabase } from "../../../src/db/index.js";
import type { LoginAttemptTracker } from "../../../src/modules/auth/ports/login-attempt-tracker.port.js";

function buildTracker(overrides: Partial<LoginAttemptTracker> = {}) {
  return {
    isLocked: vi.fn().mockResolvedValue(false),
    recordFailure: vi.fn().mockResolvedValue(1),
    reset: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } satisfies LoginAttemptTracker;
}

function buildDeps(user: unknown) {
  const findOne = vi.fn().mockResolvedValue(user);
  const create = vi.fn().mockResolvedValue(undefined);
  const database = { models: { User: { findOne, create } } } as unknown as AppDatabase;
  const sessions = {
    createTokenPair: vi.fn().mockResolvedValue({
      accessToken: "a",
      refreshToken: "r",
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: 2592000,
    }),
    rotate: vi.fn(),
    revoke: vi.fn(),
    revokeFamily: vi.fn(),
    purgeExpired: vi.fn(),
  };
  return { database, sessions, findOne, create };
}

describe("auth service login", () => {
  it("refuses immediately when the account is locked, without touching the database", async () => {
    const { database, sessions, findOne } = buildDeps(null);
    const tracker = buildTracker({ isLocked: vi.fn().mockResolvedValue(true) });

    await expect(
      createAuthService(database, sessions, tracker).login({ username: "u", password: "p" }),
    ).rejects.toThrow("登录失败次数过多，请稍后再试");
    expect(findOne).not.toHaveBeenCalled();
  });

  it("records a failure and returns the generic message when the user does not exist", async () => {
    const { database, sessions } = buildDeps(null);
    const tracker = buildTracker();

    await expect(
      createAuthService(database, sessions, tracker).login({ username: "u", password: "p" }),
    ).rejects.toThrow("用户名或密码错误");
    expect(tracker.recordFailure).toHaveBeenCalledWith("u");
  });

  it("returns the same message for a wrong password so usernames cannot be enumerated", async () => {
    const hash = await bcrypt.hash("correct-password", 4);
    const { database, sessions } = buildDeps({ id: 1, username: "u", password: hash });
    const tracker = buildTracker();

    await expect(
      createAuthService(database, sessions, tracker).login({ username: "u", password: "wrong-password" }),
    ).rejects.toThrow("用户名或密码错误");
    expect(tracker.recordFailure).toHaveBeenCalledTimes(1);
  });

  it("issues a token pair and clears the failure counter on success", async () => {
    const hash = await bcrypt.hash("correct-password", 4);
    const user = { id: 1, username: "u", password: hash };
    const { database, sessions } = buildDeps(user);
    const tracker = buildTracker();

    const pair = await createAuthService(database, sessions, tracker).login(
      { username: "u", password: "correct-password" },
      { ipAddress: "1.2.3.4" },
    );

    expect(pair.accessToken).toBe("a");
    expect(tracker.reset).toHaveBeenCalledWith("u");
    expect(tracker.recordFailure).not.toHaveBeenCalled();
    expect(sessions.createTokenPair).toHaveBeenCalledWith(user, { ipAddress: "1.2.3.4" });
  });
});

describe("auth service register", () => {
  it("stores a bcrypt hash rather than the raw password", async () => {
    const { database, sessions, create } = buildDeps(null);

    await createAuthService(database, sessions, buildTracker()).register({ username: "u", password: "password123" });

    const [values] = create.mock.calls[0] as [{ username: string; password: string }];
    expect(values.username).toBe("u");
    expect(values.password).not.toBe("password123");
    expect(await bcrypt.compare("password123", values.password)).toBe(true);
  });

  it("maps a unique constraint violation to a conflict", async () => {
    const { database, sessions, create } = buildDeps(null);
    const { UniqueConstraintError } = await import("sequelize");
    create.mockRejectedValue(new UniqueConstraintError({}));

    await expect(
      createAuthService(database, sessions, buildTracker()).register({ username: "u", password: "password123" }),
    ).rejects.toThrow("用户名已存在");
  });
});
