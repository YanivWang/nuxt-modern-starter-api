import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { connectDatabase, sequelize, User, UserProfile } from "./db.js";
import type { connectRedis, disconnectRedis } from "./redis.js";
import type { Express } from "express";

type DbModule = {
  connectDatabase: typeof connectDatabase;
  sequelize: typeof sequelize;
  User: typeof User;
  UserProfile: typeof UserProfile;
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

async function cleanDatabase() {
  await db.UserProfile.destroy({ where: {} });
  await db.User.destroy({ where: {} });
}

async function registerAndLogin(username = uniqueUsername(), password = "password123") {
  await request(app).post("/api/register").send({ username, password }).expect(200);
  const loginRes = await request(app).post("/api/login").send({ username, password }).expect(200);
  return {
    username,
    password,
    token: loginRes.body.token as string,
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
    const { token, username } = await registerAndLogin();

    expect(token).toEqual(expect.any(String));

    const meRes = await request(app).get("/api/me").set("Authorization", `Bearer ${token}`).expect(200);
    expect(meRes.body.user).toMatchObject({
      username,
      avatar: null,
      nickname: null,
    });
    expect(meRes.body.user.password).toBeUndefined();
  });

  it("rejects current user requests without a token", async () => {
    const res = await request(app).get("/api/me").expect(401);

    expect(res.body).toMatchObject({
      code: 401,
      msg: "未登录或无效登录凭证",
    });
  });

  it("blacklists the token after logout", async () => {
    const { token } = await registerAndLogin();

    await request(app).post("/api/logout").set("Authorization", `Bearer ${token}`).expect(200);

    const res = await request(app).get("/api/me").set("Authorization", `Bearer ${token}`).expect(401);
    expect(res.body.code).toBe(401);
  });
});
