/**
 * 文件职责：产品基础域集成测试。
 * 覆盖真实工作区项目与文档 API，确保前端不再依赖本地 mock 数据。
 */
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestRuntime } from "./support/test-runtime.js";

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
    runtime = createTestRuntime();
    app = runtime.app;
    await runtime.connect();
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

  it("updates authenticated user project title and syncs linked document title", async () => {
    const { accessToken } = await registerAndLogin();

    const createRes = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "原始标题" })
      .expect(201);

    const projectId = createRes.body.data.project.id as string;
    const documentId = createRes.body.data.document.id as string;

    const patchRes = await request(app)
      .patch(`/api/projects/${projectId}`)
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
      .get(`/api/documents/${documentId}`)
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
      .post("/api/projects")
      .set("Authorization", `Bearer ${firstUser.accessToken}`)
      .send({ title: "不可更新项目" })
      .expect(201);

    const projectId = createRes.body.data.project.id as string;

    await request(app)
      .patch(`/api/projects/${projectId}`)
      .set("Authorization", `Bearer ${secondUser.accessToken}`)
      .send({ title: "越权标题" })
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
