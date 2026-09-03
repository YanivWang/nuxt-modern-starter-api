/**
 * 文件职责：access token 校验单元测试。
 * 覆盖签名、jti 缺失、黑名单命中，以及登出专用的「允许过期但仍校验签名」路径。
 * 另外覆盖黑名单存储不可用时的分工：强制登录抛 500，可选登录降级为匿名 —— 两者都不能是 401。
 */
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";

import { JWT_SECRET } from "../../../src/env.js";
import { createJwtVerifier } from "../../../src/modules/auth/jwt-verify.service.js";

import type { TokenBlacklist } from "../../../src/modules/auth/ports/token-blacklist.port.js";

function blacklistWith(blocked: string[] = []): TokenBlacklist {
  return {
    add: vi.fn().mockResolvedValue(undefined),
    has: vi.fn((jti: string) => Promise.resolve(blocked.includes(jti))),
  };
}

/** 黑名单存储不可用（Redis 断连时 node-redis 就是这样 reject 的） */
function brokenBlacklist(): TokenBlacklist {
  return {
    add: vi.fn().mockResolvedValue(undefined),
    has: vi.fn(() => Promise.reject(new Error("Connection is closed."))),
  };
}

const sign = (options: jwt.SignOptions = {}) =>
  jwt.sign({ id: 1, username: "demo" }, JWT_SECRET, { expiresIn: 900, jwtid: "jti-1", ...options });

describe("jwt verifier require", () => {
  it("accepts a valid token", async () => {
    const user = await createJwtVerifier(blacklistWith()).require(sign());
    expect(user.id).toBe(1);
    expect(user.jti).toBe("jti-1");
  });

  it("rejects a token signed with a different secret", async () => {
    const foreign = jwt.sign({ id: 1, username: "demo" }, "another-secret-that-is-long-enough-x", { jwtid: "j" });
    await expect(createJwtVerifier(blacklistWith()).require(foreign)).rejects.toThrow();
  });

  it("rejects a token without jti, since logout could not blacklist it", async () => {
    const noJti = jwt.sign({ id: 1, username: "demo" }, JWT_SECRET, { expiresIn: 900 });
    await expect(createJwtVerifier(blacklistWith()).require(noJti)).rejects.toThrow("missing jti");
  });

  it("rejects a blacklisted token", async () => {
    await expect(createJwtVerifier(blacklistWith(["jti-1"])).require(sign())).rejects.toThrow(jwt.TokenExpiredError);
  });

  it("rejects an expired token", async () => {
    await expect(createJwtVerifier(blacklistWith()).require(sign({ expiresIn: -10 }))).rejects.toThrow(
      jwt.TokenExpiredError,
    );
  });
});

describe("jwt verifier requireAllowExpired", () => {
  it("accepts an expired but correctly signed token so logout still works", async () => {
    const user = await createJwtVerifier(blacklistWith()).requireAllowExpired(sign({ expiresIn: -10 }));
    expect(user.id).toBe(1);
  });

  it("still rejects a bad signature", async () => {
    const foreign = jwt.sign({ id: 1, username: "demo" }, "another-secret-that-is-long-enough-x", { jwtid: "j" });
    await expect(createJwtVerifier(blacklistWith()).requireAllowExpired(foreign)).rejects.toThrow();
  });

  it("still rejects a blacklisted token", async () => {
    await expect(
      createJwtVerifier(blacklistWith(["jti-1"])).requireAllowExpired(sign({ expiresIn: -10 })),
    ).rejects.toThrow(jwt.TokenExpiredError);
  });
});

describe("jwt verifier resolve", () => {
  it("returns the user for a valid token and null for anything unusable", async () => {
    const verifier = createJwtVerifier(blacklistWith(["jti-blocked"]));
    expect(await verifier.resolve(sign())).not.toBeNull();
    expect(await verifier.resolve("not-a-token")).toBeNull();
    expect(await verifier.resolve(sign({ expiresIn: -10 }))).toBeNull();
    expect(await verifier.resolve(sign({ jwtid: "jti-blocked" }))).toBeNull();
  });
});

describe("token blacklist unavailable", () => {
  it("reports an internal failure instead of pretending the credential is invalid", async () => {
    // 说成 401 的后果不是「多一条日志」：客户端据此清掉本地会话，
    // 一次 Redis 抖动就会把全体在线用户登出，而日志里只剩一片「无效登录凭证」。
    await expect(createJwtVerifier(brokenBlacklist()).require(sign())).rejects.toMatchObject({
      name: "AppError",
      code: "INTERNAL",
    });
  });

  it("never silently accepts a token it could not check", async () => {
    // 反过来当成「未吊销」同样错：那等于在依赖故障期间让已登出的 token 重新可用
    await expect(createJwtVerifier(brokenBlacklist()).require(sign())).rejects.toThrow();
    await expect(createJwtVerifier(brokenBlacklist()).requireAllowExpired(sign())).rejects.toThrow();
  });

  it("degrades optional auth to anonymous rather than failing the request", async () => {
    // resolve 的调用方本来就允许匿名，降级只会减少权限；
    // 在这里抛错会让一次 Redis 抖动把允许匿名的公开页也一并打挂。
    await expect(createJwtVerifier(brokenBlacklist()).resolve(sign())).resolves.toBeNull();
  });
});
