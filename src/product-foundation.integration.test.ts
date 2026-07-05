/**
 * 文件职责：产品基础域集成测试。
 * 覆盖真实工作区项目与文档 API，确保前端不再依赖本地 mock 数据。
 */
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type {
  connectDatabase,
  Document,
  Project,
  sequelize,
  User,
  UserProfile,
  UserRefreshToken,
  Workspace,
} from "./db.js";
import type { connectRedis, disconnectRedis } from "./redis.js";
import type { Express } from "express";

type DbModule = {
  connectDatabase: typeof connectDatabase;
  sequelize: typeof sequelize;
  User: typeof User;
  UserProfile: typeof UserProfile;
  UserRefreshToken: typeof UserRefreshToken;
  Workspace: typeof Workspace;
  Project: typeof Project;
  Document: typeof Document;
};

type RedisModule = {
  connectRedis: typeof connectRedis;
  disconnectRedis: typeof disconnectRedis;
};

let app: Express;
let db: DbModule;
let redisModule: RedisModule;

function uniqueUsername() {
  return `product_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function cleanDatabase() {
  await db.Document.destroy({ where: {} });
  await db.Project.destroy({ where: {} });
  await db.Workspace.destroy({ where: {} });
  await db.UserRefreshToken.destroy({ where: {} });
  await db.UserProfile.destroy({ where: {} });
  await db.User.destroy({ where: {} });
}

async function registerAndLogin(username = uniqueUsername(), password = "password123") {
  await request(app).post("/api/register").send({ username, password }).expect(200);
  const loginRes = await request(app).post("/api/login").send({ username, password }).expect(200);

  return {
    username,
    accessToken: loginRes.body.data.accessToken as string,
    refreshToken: loginRes.body.data.refreshToken as string,
  };
}

describe("product foundation API", () => {
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

  it("uses the standard code/message/data response envelope", async () => {
    const username = uniqueUsername();
    const password = "password123";

    const res = await request(app).post("/api/register").send({ username, password }).expect(200);

    expect(res.body).toEqual({
      code: 200,
      message: "注册成功",
      data: null,
    });
  });

  it("creates, lists, reads, and saves authenticated user projects and documents", async () => {
    const { accessToken } = await registerAndLogin();

    const createRes = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "季度增长汇报",
        description: "真实数据库中的第一份演示文稿",
      })
      .expect(201);

    expect(createRes.body).toMatchObject({
      code: 201,
      message: "创建项目成功",
      data: {
        project: {
          title: "季度增长汇报",
          description: "真实数据库中的第一份演示文稿",
          status: "draft",
        },
        document: {
          title: "季度增长汇报",
          content: "",
        },
      },
    });

    const projectId = createRes.body.data.project.id as string;
    const documentId = createRes.body.data.document.id as string;

    const listRes = await request(app).get("/api/projects").set("Authorization", `Bearer ${accessToken}`).expect(200);
    expect(listRes.body.data.projects).toHaveLength(1);
    expect(listRes.body.data.projects[0]).toMatchObject({
      id: projectId,
      title: "季度增长汇报",
      documentId,
      editPath: `/app/workspace/${projectId}/edit`,
      previewPath: `/app/workspace/${projectId}/preview`,
    });

    const documentRes = await request(app)
      .get(`/api/documents/${documentId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(documentRes.body.data.document).toMatchObject({
      id: documentId,
      projectId,
      title: "季度增长汇报",
      content: "",
    });

    const saveRes = await request(app)
      .patch(`/api/documents/${documentId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "季度增长汇报 v2",
        content: "<h1>增长亮点</h1>",
      })
      .expect(200);

    expect(saveRes.body.data.document).toMatchObject({
      id: documentId,
      title: "季度增长汇报 v2",
      content: "<h1>增长亮点</h1>",
    });
  });

  it("prevents users from reading another user's document", async () => {
    const firstUser = await registerAndLogin();
    const secondUser = await registerAndLogin();

    const createRes = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${firstUser.accessToken}`)
      .send({ title: "私有文档" })
      .expect(201);

    const documentId = createRes.body.data.document.id as string;

    await request(app)
      .get(`/api/documents/${documentId}`)
      .set("Authorization", `Bearer ${secondUser.accessToken}`)
      .expect(404);
  });

  it("deletes authenticated user projects and their documents", async () => {
    const { accessToken } = await registerAndLogin();

    const createRes = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "待删除项目" })
      .expect(201);

    const projectId = createRes.body.data.project.id as string;
    const documentId = createRes.body.data.document.id as string;

    const deleteRes = await request(app)
      .delete(`/api/projects/${projectId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(deleteRes.body).toEqual({
      code: 200,
      message: "删除项目成功",
      data: null,
    });

    const listRes = await request(app).get("/api/projects").set("Authorization", `Bearer ${accessToken}`).expect(200);
    expect(listRes.body.data.projects).toEqual([]);

    await request(app).get(`/api/documents/${documentId}`).set("Authorization", `Bearer ${accessToken}`).expect(404);
  });

  it("prevents users from deleting another user's project", async () => {
    const firstUser = await registerAndLogin();
    const secondUser = await registerAndLogin();

    const createRes = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${firstUser.accessToken}`)
      .send({ title: "不可删除项目" })
      .expect(201);

    const projectId = createRes.body.data.project.id as string;

    await request(app)
      .delete(`/api/projects/${projectId}`)
      .set("Authorization", `Bearer ${secondUser.accessToken}`)
      .expect(404);
  });

  it("prevents users from reading another user's project", async () => {
    const firstUser = await registerAndLogin();
    const secondUser = await registerAndLogin();

    const createRes = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${firstUser.accessToken}`)
      .send({ title: "私有项目" })
      .expect(201);

    const projectId = createRes.body.data.project.id as string;

    await request(app)
      .get(`/api/projects/${projectId}`)
      .set("Authorization", `Bearer ${secondUser.accessToken}`)
      .expect(404);
  });
});
