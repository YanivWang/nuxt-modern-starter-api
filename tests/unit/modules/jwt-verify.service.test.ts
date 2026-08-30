/**
 * 文件职责：access token 校验单元测试。
 * 覆盖签名、jti 缺失、黑名单命中，以及登出专用的「允许过期但仍校验签名」路径。
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
