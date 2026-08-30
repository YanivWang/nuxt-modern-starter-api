/**
 * 文件职责：产品基础域集成测试。
 * 覆盖真实工作区项目与文档 API，确保前端不再依赖本地 mock 数据。
 */
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestRuntime, resetRedisState } from "./support/test-runtime.js";

import type { AppRuntime } from "../../src/runtime.js";
import type { Express } from "express";

let app: Express;
let runtime: AppRuntime;

function uniqueUsername() {
  return `product_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function cleanDatabase() {
  const { Document, Project, Workspace, UserRefreshToken, UserProfile, User } = runtime.database.models;
  await Document.destroy({ where: {} });
  await Project.destroy({ where: {} });
  await Workspace.destroy({ where: {} });
  await UserRefreshToken.destroy({ where: {} });
  await UserProfile.destroy({ where: {} });
  await User.destroy({ where: {} });
}

async function registerAndLogin(username = uniqueUsername(), password = "password123") {
  await request(app).post("/api/v1/register").send({ username, password }).expect(200);
  const loginRes = await request(app).post("/api/v1/login").send({ username, password }).expect(200);

  return {
    username,
    accessToken: loginRes.body.data.accessToken as string,
    refreshToken: loginRes.body.data.refreshToken as string,
  };
}

describe("product foundation API", () => {
  beforeAll(async () => {
    runtime = createTestRuntime();
    app = runtime.app;
    await runtime.connect();
    // 限流 / 登录失败计数 / JWT 黑名单都带 TTL 存在 Redis 里，不清理会跨运行残留
    await resetRedisState(runtime);
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase().catch(() => {});
    await runtime.disconnect();
  });

  it("uses the standard code/message/data response envelope", async () => {
    const username = uniqueUsername();
    const password = "password123";

    const res = await request(app).post("/api/v1/register").send({ username, password }).expect(200);

    expect(res.body).toEqual({
      code: 200,
      message: "注册成功",
      data: null,
    });
  });

  it("creates, lists, reads, and saves authenticated user projects and documents", async () => {
    const { accessToken } = await registerAndLogin();

    const createRes = await request(app)
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "季度增长汇报",
        description: "真实数据库中的第一份演示文稿",
      })
      .expect(201);

    expect(createRes.body).toMatchObject({
      code: 200,
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

    const listRes = await request(app)
      .get("/api/v1/projects")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(listRes.body.data.projects).toHaveLength(1);
    expect(listRes.body.data.projects[0]).toMatchObject({
      id: projectId,
      title: "季度增长汇报",
      documentId,
      status: "draft",
      accent: "blue",
    });
    // 路由表属于前端：DTO 不得再携带 editPath / previewPath 这类由后端拼出的前端路径。
    expect(listRes.body.data.projects[0]).not.toHaveProperty("editPath");
    expect(listRes.body.data.projects[0]).not.toHaveProperty("previewPath");

    const documentRes = await request(app)
      .get(`/api/v1/documents/${documentId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(documentRes.body.data.document).toMatchObject({
      id: documentId,
      projectId,
      title: "季度增长汇报",
      content: "",
    });

    const saveRes = await request(app)
      .patch(`/api/v1/documents/${documentId}`)
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
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${firstUser.accessToken}`)
      .send({ title: "私有文档" })
      .expect(201);

    const documentId = createRes.body.data.document.id as string;

    await request(app)
      .get(`/api/v1/documents/${documentId}`)
      .set("Authorization", `Bearer ${secondUser.accessToken}`)
      .expect(404);
  });

  it("updates authenticated user project title and syncs linked document title", async () => {
    const { accessToken } = await registerAndLogin();

    const createRes = await request(app)
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "原始标题" })
      .expect(201);

    const projectId = createRes.body.data.project.id as string;
    const documentId = createRes.body.data.document.id as string;

    const patchRes = await request(app)
      .patch(`/api/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "更新后的标题" })
      .expect(200);

    expect(patchRes.body).toMatchObject({
      code: 200,
      message: "更新项目成功",
      data: {
        project: {
          id: projectId,
          title: "更新后的标题",
        },
      },
    });

    const documentRes = await request(app)
      .get(`/api/v1/documents/${documentId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(documentRes.body.data.document).toMatchObject({
      id: documentId,
      title: "更新后的标题",
    });
  });

  it("prevents users from updating another user's project", async () => {
    const firstUser = await registerAndLogin();
    const secondUser = await registerAndLogin();

    const createRes = await request(app)
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${firstUser.accessToken}`)
      .send({ title: "不可更新项目" })
      .expect(201);

    const projectId = createRes.body.data.project.id as string;

    await request(app)
      .patch(`/api/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${secondUser.accessToken}`)
      .send({ title: "越权标题" })
      .expect(404);
  });

  it("paginates the project list and reports total/hasMore", async () => {
    const { accessToken } = await registerAndLogin();
    const auth = { Authorization: `Bearer ${accessToken}` };

    for (const title of ["p1", "p2", "p3"]) {
      await request(app).post("/api/v1/projects").set(auth).send({ title }).expect(201);
    }

    const firstPage = await request(app).get("/api/v1/projects?limit=2&offset=0").set(auth).expect(200);
    expect(firstPage.body.data.projects).toHaveLength(2);
    expect(firstPage.body.data.pagination).toEqual({ total: 3, limit: 2, offset: 0, hasMore: true });

    const lastPage = await request(app).get("/api/v1/projects?limit=2&offset=2").set(auth).expect(200);
    expect(lastPage.body.data.projects).toHaveLength(1);
    expect(lastPage.body.data.pagination).toEqual({ total: 3, limit: 2, offset: 2, hasMore: false });

    // 两页之间不应重复返回同一个项目。
    const ids = [...firstPage.body.data.projects, ...lastPage.body.data.projects].map(
      (project: { id: string }) => project.id,
    );
    expect(new Set(ids).size).toBe(3);
  });

  it("applies a default page size and rejects an oversized limit", async () => {
    const { accessToken } = await registerAndLogin();
    const auth = { Authorization: `Bearer ${accessToken}` };

    const defaulted = await request(app).get("/api/v1/projects").set(auth).expect(200);
    expect(defaulted.body.data.pagination).toMatchObject({ limit: 20, offset: 0 });

    // 上限存在的意义就是不允许客户端把分页退化成全表扫描。
    await request(app).get("/api/v1/projects?limit=1000").set(auth).expect(400);
    await request(app).get("/api/v1/projects?offset=-1").set(auth).expect(400);
  });

  it("deletes authenticated user projects and their documents", async () => {
    const { accessToken } = await registerAndLogin();

    const createRes = await request(app)
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "待删除项目" })
      .expect(201);

    const projectId = createRes.body.data.project.id as string;
    const documentId = createRes.body.data.document.id as string;

    const deleteRes = await request(app)
      .delete(`/api/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(deleteRes.body).toEqual({
      code: 200,
      message: "删除项目成功",
      data: null,
    });

    const listRes = await request(app)
      .get("/api/v1/projects")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(listRes.body.data.projects).toEqual([]);

    await request(app).get(`/api/v1/documents/${documentId}`).set("Authorization", `Bearer ${accessToken}`).expect(404);
  });

  it("prevents users from deleting another user's project", async () => {
    const firstUser = await registerAndLogin();
    const secondUser = await registerAndLogin();

    const createRes = await request(app)
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${firstUser.accessToken}`)
      .send({ title: "不可删除项目" })
      .expect(201);

    const projectId = createRes.body.data.project.id as string;

    await request(app)
      .delete(`/api/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${secondUser.accessToken}`)
      .expect(404);
  });

  it("prevents users from reading another user's project", async () => {
    const firstUser = await registerAndLogin();
    const secondUser = await registerAndLogin();

    const createRes = await request(app)
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${firstUser.accessToken}`)
      .send({ title: "私有项目" })
      .expect(201);

    const projectId = createRes.body.data.project.id as string;

    await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set("Authorization", `Bearer ${secondUser.accessToken}`)
      .expect(404);
  });
});
