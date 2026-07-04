import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { connectDatabase, sequelize, User, UserProfile, UserRefreshToken } from "./db.js";
import type { connectRedis, disconnectRedis } from "./redis.js";
import type { Express } from "express";

type DbModule = {
  connectDatabase: typeof connectDatabase;
  sequelize: typeof sequelize;
  User: typeof User;
  UserProfile: typeof UserProfile;
  UserRefreshToken: typeof UserRefreshToken;
};

type RedisModule = {
  connectRedis: typeof connectRedis;
  disconnectRedis: typeof disconnectRedis;
};

let app: Express;
let db: DbModule;
let redisModule: RedisModule;

function uniqueUsername() {
  return `user_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function cookieValue(cookies: string[] | undefined, name: string): string | undefined {
  const matched = cookies?.find((cookie) => cookie.startsWith(`${name}=`));
  return matched?.split(";")[0]?.slice(name.length + 1);
}

async function cleanDatabase() {
  await db.UserRefreshToken.destroy({ where: {} });
  await db.UserProfile.destroy({ where: {} });
  await db.User.destroy({ where: {} });
}

async function registerAndLogin(username = uniqueUsername(), password = "password123") {
  await request(app).post("/api/register").send({ username, password }).expect(200);
  const loginRes = await request(app).post("/api/login").send({ username, password }).expect(200);
  const rawSetCookie = loginRes.headers["set-cookie"];
  return {
    username,
    password,
    token: loginRes.body.token as string,
    accessToken: loginRes.body.accessToken as string,
    refreshToken: loginRes.body.refreshToken as string,
    setCookie: Array.isArray(rawSetCookie) ? rawSetCookie : rawSetCookie ? [rawSetCookie] : undefined,
  };
}

describe("auth and current user API", () => {
  beforeAll(async () => {
    db = await import("./db.js");
    redisModule = await import("./redis.js");
    const appModule = await import("./app.js");
    app = appModule.default;

    await db.connectDatabase();
    await redisModule.connectRedis();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase().catch(() => {});
    await redisModule.disconnectRedis().catch(() => {});
    await db.sequelize.close().catch(() => {});
  });

  it("registers a user and rejects duplicate usernames", async () => {
    const username = uniqueUsername();
    const password = "password123";

    await request(app).post("/api/register").send({ username, password }).expect(200);

    const duplicateRes = await request(app).post("/api/register").send({ username, password }).expect(409);
    expect(duplicateRes.body).toMatchObject({
      code: 409,
      msg: "用户名已存在",
    });
  });

  it("logs in and returns a usable token", async () => {
    const { accessToken, refreshToken, token, username } = await registerAndLogin();

    expect(accessToken).toEqual(expect.any(String));
    expect(refreshToken).toEqual(expect.any(String));
    expect(token).toBe(accessToken);

    const meRes = await request(app).get("/api/me").set("Authorization", `Bearer ${accessToken}`).expect(200);
    expect(meRes.body.user).toMatchObject({
      username,
      avatar: null,
      nickname: null,
    });
    expect(meRes.body.user.password).toBeUndefined();
  });

  it("accepts the access token from an httpOnly cookie", async () => {
    const { setCookie, username } = await registerAndLogin();

    expect(setCookie?.some((cookie) => cookie.startsWith("access_token=") && cookie.includes("HttpOnly"))).toBe(true);
    expect(setCookie?.some((cookie) => cookie.startsWith("refresh_token=") && cookie.includes("HttpOnly"))).toBe(true);
    expect(setCookie?.some((cookie) => cookie.startsWith("csrf_token=") && !cookie.includes("HttpOnly"))).toBe(true);

    const meRes = await request(app)
      .get("/api/me")
      .set("Cookie", setCookie ?? [])
      .expect(200);
    expect(meRes.body.user).toMatchObject({ username });
  });

  it("requires a CSRF token for unsafe cookie-authenticated requests", async () => {
    const { refreshToken, setCookie } = await registerAndLogin();
    const csrfToken = cookieValue(setCookie, "csrf_token");

    expect(csrfToken).toEqual(expect.any(String));

    await request(app)
      .post("/api/logout")
      .set("Cookie", setCookie ?? [])
      .send({ refreshToken })
      .expect(403);

    await request(app)
      .post("/api/logout")
      .set("Cookie", setCookie ?? [])
      .set("X-CSRF-Token", csrfToken ?? "")
      .send({ refreshToken })
      .expect(200);
  });

  it("rotates refresh tokens and rejects reused refresh tokens", async () => {
    const { refreshToken, username } = await registerAndLogin();

    const refreshRes = await request(app).post("/api/refresh").send({ refreshToken }).expect(200);

    expect(refreshRes.body.accessToken).toEqual(expect.any(String));
    expect(refreshRes.body.refreshToken).toEqual(expect.any(String));
    expect(refreshRes.body.refreshToken).not.toBe(refreshToken);
    expect(refreshRes.body.token).toBe(refreshRes.body.accessToken);

    await request(app).post("/api/refresh").send({ refreshToken }).expect(401);

    const meRes = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${refreshRes.body.accessToken as string}`)
      .expect(200);
    expect(meRes.body.user).toMatchObject({ username });
  });

  it("rejects current user requests without a token", async () => {
    const res = await request(app).get("/api/me").expect(401);

    expect(res.body).toMatchObject({
      code: 401,
      msg: "未登录或无效登录凭证",
    });
  });

  it("blacklists the token after logout", async () => {
    const { accessToken, refreshToken } = await registerAndLogin();

    await request(app)
      .post("/api/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    const res = await request(app).get("/api/me").set("Authorization", `Bearer ${accessToken}`).expect(401);
    expect(res.body.code).toBe(401);

    await request(app).post("/api/refresh").send({ refreshToken }).expect(401);
  });
});
