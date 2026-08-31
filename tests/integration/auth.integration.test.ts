/**
 * 文件职责：认证与当前用户 API 集成测试。
 * 覆盖注册去重、登录 token、Cookie 登录、CSRF、防 refresh token 重放、登出黑名单等真实 HTTP 行为。
 */
import { randomUUID } from "node:crypto";

import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { JWT_SECRET } from "../../src/env.js";
import { createTestRuntime, resetRedisState, startTestServer, stopTestServer } from "./support/test-runtime.js";

import type { AppRuntime } from "../../src/runtime.js";
import type { Server } from "node:http";

let server: Server;
let runtime: AppRuntime;

function uniqueUsername() {
  return `user_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function cookieValue(cookies: string[] | undefined, name: string): string | undefined {
  const matched = cookies?.find((cookie) => cookie.startsWith(`${name}=`));
  return matched?.split(";")[0]?.slice(name.length + 1);
}

async function cleanDatabase() {
  await runtime.database.models.UserRefreshToken.destroy({ where: {} });
  await runtime.database.models.UserProfile.destroy({ where: {} });
  await runtime.database.models.User.destroy({ where: {} });
}

async function registerAndLogin(username = uniqueUsername(), password = "password123") {
  await request(server).post("/api/v1/register").send({ username, password }).expect(200);
  const loginRes = await request(server).post("/api/v1/login").send({ username, password }).expect(200);
  const rawSetCookie = loginRes.headers["set-cookie"];
  return {
    username,
    password,
    accessToken: loginRes.body.data.accessToken as string,
    refreshToken: loginRes.body.data.refreshToken as string,
    setCookie: Array.isArray(rawSetCookie) ? rawSetCookie : rawSetCookie ? [rawSetCookie] : undefined,
  };
}

describe("auth and current user API", () => {
  beforeAll(async () => {
    runtime = createTestRuntime();
    server = startTestServer(runtime);
    await runtime.connect();
    // 限流 / 登录失败计数 / JWT 黑名单都带 TTL 存在 Redis 里，不清理会跨运行残留
    await resetRedisState(runtime);
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase().catch(() => {});
    await stopTestServer(server);
    await runtime.disconnect();
  });

  it("registers a user and rejects duplicate usernames", async () => {
    const username = uniqueUsername();
    const password = "password123";

    await request(server).post("/api/v1/register").send({ username, password }).expect(200);

    const duplicateRes = await request(server).post("/api/v1/register").send({ username, password }).expect(409);
    expect(duplicateRes.body).toMatchObject({
      code: 409,
      message: "用户名已存在",
      data: null,
    });
  });

  it("logs in and returns a usable token", async () => {
    const { accessToken, refreshToken, username } = await registerAndLogin();

    expect(accessToken).toEqual(expect.any(String));
    expect(refreshToken).toEqual(expect.any(String));

    const meRes = await request(server).get("/api/v1/me").set("Authorization", `Bearer ${accessToken}`).expect(200);
    expect(meRes.body.data.user).toMatchObject({
      username,
      avatar: null,
      nickname: null,
    });
    expect(meRes.body.data.user.password).toBeUndefined();
  });

  it("accepts the access token from an httpOnly cookie", async () => {
    const { setCookie, username } = await registerAndLogin();

    expect(setCookie?.some((cookie) => cookie.startsWith("access_token=") && cookie.includes("HttpOnly"))).toBe(true);
    expect(setCookie?.some((cookie) => cookie.startsWith("refresh_token=") && cookie.includes("HttpOnly"))).toBe(true);
    expect(setCookie?.some((cookie) => cookie.startsWith("csrf_token=") && !cookie.includes("HttpOnly"))).toBe(true);

    const meRes = await request(server)
      .get("/api/v1/me")
      .set("Cookie", setCookie ?? [])
      .expect(200);
    expect(meRes.body.data.user).toMatchObject({ username });
  });

  it("requires a CSRF token for unsafe cookie-authenticated requests", async () => {
    const { refreshToken, setCookie } = await registerAndLogin();
    const csrfToken = cookieValue(setCookie, "csrf_token");

    expect(csrfToken).toEqual(expect.any(String));

    await request(server)
      .post("/api/v1/logout")
      .set("Cookie", setCookie ?? [])
      .send({ refreshToken })
      .expect(403);

    await request(server)
      .post("/api/v1/logout")
      .set("Cookie", setCookie ?? [])
      .set("X-CSRF-Token", csrfToken ?? "")
      .send({ refreshToken })
      .expect(200);
  });

  it("rotates refresh tokens and rejects reused refresh tokens", async () => {
    const { refreshToken, username } = await registerAndLogin();

    const refreshRes = await request(server).post("/api/v1/refresh").send({ refreshToken }).expect(200);

    expect(refreshRes.body.data.accessToken).toEqual(expect.any(String));
    expect(refreshRes.body.data.refreshToken).toEqual(expect.any(String));
    expect(refreshRes.body.data.refreshToken).not.toBe(refreshToken);

    await request(server).post("/api/v1/refresh").send({ refreshToken }).expect(401);

    const meRes = await request(server)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${refreshRes.body.data.accessToken as string}`)
      .expect(200);
    expect(meRes.body.data.user).toMatchObject({ username });
  });

  it("revokes the whole token family when a used refresh token is replayed", async () => {
    const { refreshToken: tokenA } = await registerAndLogin();

    // 正常轮换：A -> B
    const rotated = await request(server).post("/api/v1/refresh").send({ refreshToken: tokenA }).expect(200);
    const tokenB = rotated.body.data.refreshToken as string;

    // 重放已被使用的 A，说明 A 已泄露。
    await request(server).post("/api/v1/refresh").send({ refreshToken: tokenA }).expect(401);

    // 关键断言：攻击者此前换到的 B 也必须失效，而不是继续可用。
    await request(server).post("/api/v1/refresh").send({ refreshToken: tokenB }).expect(401);
  });

  it("allows logout with an expired access token so a compromised session can still be revoked", async () => {
    const { refreshToken, username } = await registerAndLogin();
    const expiredAccessToken = jwt.sign({ id: 1, username }, JWT_SECRET, {
      expiresIn: -60,
      jwtid: randomUUID(),
    });

    await request(server)
      .post("/api/v1/logout")
      .set("Authorization", `Bearer ${expiredAccessToken}`)
      .send({ refreshToken })
      .expect(200);

    // 登出后 refresh token 必须已被撤销。
    await request(server).post("/api/v1/refresh").send({ refreshToken }).expect(401);
  });

  it("rejects a logout attempt whose token signature is invalid, even when expired", async () => {
    const forged = jwt.sign({ id: 1, username: "x" }, "a-different-secret-long-enough-for-jwt", {
      expiresIn: -60,
      jwtid: randomUUID(),
    });

    await request(server).post("/api/v1/logout").set("Authorization", `Bearer ${forged}`).send({}).expect(401);
  });

  it.each(["%", "%zz", "abc%"])(
    "answers 401 instead of crashing when the access_token cookie is malformed (%j)",
    async (malformed) => {
      // 该输入曾让认证中间件抛出 URIError，并因 Express 4 不捕获中间件的 Promise reject 而终止进程。
      const res = await request(server)
        .get("/api/v1/me")
        .set("Cookie", [`access_token=${malformed}`])
        .expect(401);
      expect(res.body.code).toBe(401);

      // 进程仍然存活，后续请求照常处理。
      await request(server).get("/health").expect(200);
    },
  );

  it("serves business routes only under /api/v1 and 404s the retired /api alias", async () => {
    const { accessToken } = await registerAndLogin();

    await request(server).get("/api/v1/me").set("Authorization", `Bearer ${accessToken}`).expect(200);

    // 无版本别名已下线：带合法令牌也必须是 404，而不是静默回退到同一实现。
    // 这条断言防止别名在后续重构中被无意重新挂上。
    await request(server).get("/api/me").set("Authorization", `Bearer ${accessToken}`).expect(404);
  });

  it("rejects registration passwords below the minimum length but still accepts them at login", async () => {
    const username = uniqueUsername();
    await request(server).post("/api/v1/register").send({ username, password: "short7" }).expect(400);

    // 登录侧不复用注册的长度下限，否则提高强度要求会把存量短密码用户锁在门外。
    await request(server).post("/api/v1/login").send({ username, password: "short7" }).expect(401);
  });

  it("rejects current user requests without a token", async () => {
    const res = await request(server).get("/api/v1/me").expect(401);

    expect(res.body).toMatchObject({
      code: 401,
      message: "未登录或无效登录凭证",
      data: null,
    });
  });

  it("blacklists the token after logout", async () => {
    const { accessToken, refreshToken } = await registerAndLogin();

    await request(server)
      .post("/api/v1/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    const res = await request(server).get("/api/v1/me").set("Authorization", `Bearer ${accessToken}`).expect(401);
    expect(res.body.code).toBe(401);

    await request(server).post("/api/v1/refresh").send({ refreshToken }).expect(401);
  });
});
