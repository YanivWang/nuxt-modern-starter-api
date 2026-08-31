/**
 * 文件职责：用 OpenAPI 响应契约的同一份 Zod schema 校验真实 HTTP 响应体。
 *
 * 为什么需要这一层：响应 schema 同时推导出 DTO 类型，所以「mapper 少写一个字段」是编译错误。
 * 但编译器管不到 controller 拼信封那一步——把 { project } 写成 { projects }、
 * 或者某个 Adapter 顺手多返回几个类型上看不见的字段，类型系统一概不会报警。
 * 这里对着真实响应跑一遍 schema，把那一段补上。
 *
 * 断言同时挡两个方向：
 * 少字段/类型不符由 parse 抛出；多字段由「parse 后与原始 body 相等」兜住——
 * z.object 会静默剥掉未声明的键，不比对的话 OpenAPI 里的 additionalProperties: false 等于没写。
 *
 * 端点特有的错误状态码（401/403/404/409/410）由 error-contract.integration.test.ts
 * 统一覆盖，那里还会反向校验「契约声明的每个状态码都必须能被真的触发」。
 * 这里只保留一条 400：它来自全局 validate 中间件，挑一个代表性端点验证即可。
 */
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestRuntime, resetRedisState, startTestServer, stopTestServer } from "./support/test-runtime.js";
import { generateOpenApiSpec } from "../../src/openapi.js";
import { projectRoot } from "../../src/utils/projectRoot.js";
import { authTokenPairEnvelopeSchema } from "../../src/modules/auth/auth.contract.js";
import { documentEnvelopeSchema } from "../../src/modules/document/document.contract.js";
import { errorEnvelopeSchema, nullDataEnvelopeSchema } from "../../src/shared/http/api-envelope.js";
import {
  newsArticleEnvelopeSchema,
  newsListEnvelopeSchema,
  newsSourceEnvelopeSchema,
  pricingEnvelopeSchema,
} from "../../src/modules/content/content.contract.js";
import {
  meEnvelopeSchema,
  profileEnvelopeSchema,
  updatedProfileEnvelopeSchema,
} from "../../src/modules/user/user.contract.js";
import {
  projectCreatedEnvelopeSchema,
  projectEnvelopeSchema,
  projectListEnvelopeSchema,
} from "../../src/modules/workspace/workspace.contract.js";
import {
  chunkAcceptedEnvelopeSchema,
  emptyDataEnvelopeSchema,
  imageUploadEnvelopeSchema,
  largeUploadInitEnvelopeSchema,
  largeUploadMergeEnvelopeSchema,
  largeUploadStatusEnvelopeSchema,
} from "../../src/modules/upload/upload.contract.js";

import type { AppRuntime } from "../../src/runtime.js";
import type { Server } from "node:http";
import type { z } from "zod";

let server: Server;
let runtime: AppRuntime;

/** 大文件用例留下的落盘产物，afterAll 逐个删除，避免仓库里堆积测试残留。 */
const createdFiles: string[] = [];

function uniqueUsername() {
  return `contract_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

const openApiSpec = generateOpenApiSpec();

/** 该端点在契约里声明过的状态码集合。 */
function declaredStatuses(endpoint: string): string[] {
  const [method, path] = endpoint.split(" ") as [string, string];
  const operation = openApiSpec.paths[path]?.[method.toLowerCase()];

  expect(operation, `契约里没有 ${endpoint}`).toBeDefined();

  return Object.keys(operation.responses);
}

function expectMatchesContract(schema: z.ZodType, body: unknown, endpoint: string) {
  const result = schema.safeParse(body);

  // 直接断言 issues 数组，失败时 vitest 会把「哪个字段、期望什么、实际什么」整段打出来。
  expect(result.success ? [] : result.error.issues, `${endpoint} 的响应不符合 OpenAPI 契约`).toEqual([]);
  expect(result.data, `${endpoint} 的响应里出现了契约未声明的字段`).toEqual(body);
}

async function registerAndLogin() {
  const username = uniqueUsername();
  const password = "password123";

  const registerRes = await request(server).post("/api/v1/register").send({ username, password }).expect(200);
  expectMatchesContract(nullDataEnvelopeSchema, registerRes.body, "POST /register");

  const loginRes = await request(server).post("/api/v1/login").send({ username, password }).expect(200);
  expectMatchesContract(authTokenPairEnvelopeSchema, loginRes.body, "POST /login");

  return {
    accessToken: loginRes.body.data.accessToken as string,
    refreshToken: loginRes.body.data.refreshToken as string,
  };
}

describe("API response contract", () => {
  beforeAll(async () => {
    runtime = createTestRuntime();
    server = startTestServer(runtime);
    await runtime.connect();
    // 限流 / 登录失败计数 / JWT 黑名单都带 TTL 存在 Redis 里，不清理会跨运行残留
    await resetRedisState(runtime);
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase().catch(() => {});
    for (const file of createdFiles) {
      await fs.rm(file, { force: true }).catch(() => {});
    }
    await stopTestServer(server);
    await runtime.disconnect();
  });

  it("matches the auth token contract on login, refresh and logout", async () => {
    const { accessToken, refreshToken } = await registerAndLogin();

    const refreshRes = await request(server).post("/api/v1/refresh").send({ refreshToken }).expect(200);
    expectMatchesContract(authTokenPairEnvelopeSchema, refreshRes.body, "POST /refresh");

    const logoutRes = await request(server)
      .post("/api/v1/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken: refreshRes.body.data.refreshToken })
      .expect(200);
    expectMatchesContract(nullDataEnvelopeSchema, logoutRes.body, "POST /logout");
  });

  it("matches the current-user contract before and after the profile exists", async () => {
    const { accessToken } = await registerAndLogin();
    const auth = { Authorization: `Bearer ${accessToken}` };

    const meRes = await request(server).get("/api/v1/me").set(auth).expect(200);
    expectMatchesContract(meEnvelopeSchema, meRes.body, "GET /me");

    // 从未填写过资料时 profile 为 null，这条分支必须也在契约里成立
    const emptyProfileRes = await request(server).get("/api/v1/me/profile").set(auth).expect(200);
    expectMatchesContract(profileEnvelopeSchema, emptyProfileRes.body, "GET /me/profile（空）");
    expect(emptyProfileRes.body.data.profile).toBeNull();

    const patchRes = await request(server).patch("/api/v1/me/profile").set(auth).send({ nickname: "契约" }).expect(200);
    expectMatchesContract(updatedProfileEnvelopeSchema, patchRes.body, "PATCH /me/profile");

    const filledProfileRes = await request(server).get("/api/v1/me/profile").set(auth).expect(200);
    expectMatchesContract(profileEnvelopeSchema, filledProfileRes.body, "GET /me/profile（已填写）");
  });

  it("matches the project and document contracts across the full CRUD path", async () => {
    const { accessToken } = await registerAndLogin();
    const auth = { Authorization: `Bearer ${accessToken}` };

    const createRes = await request(server).post("/api/v1/projects").set(auth).send({ title: "契约项目" }).expect(201);
    expectMatchesContract(projectCreatedEnvelopeSchema, createRes.body, "POST /projects");

    const projectId = createRes.body.data.project.id as string;
    const documentId = createRes.body.data.document.id as string;

    const listRes = await request(server).get("/api/v1/projects").set(auth).expect(200);
    expectMatchesContract(projectListEnvelopeSchema, listRes.body, "GET /projects");

    const detailRes = await request(server).get(`/api/v1/projects/${projectId}`).set(auth).expect(200);
    expectMatchesContract(projectEnvelopeSchema, detailRes.body, "GET /projects/{projectId}");

    const patchRes = await request(server)
      .patch(`/api/v1/projects/${projectId}`)
      .set(auth)
      .send({ title: "契约项目 v2" })
      .expect(200);
    expectMatchesContract(projectEnvelopeSchema, patchRes.body, "PATCH /projects/{projectId}");

    const documentRes = await request(server).get(`/api/v1/documents/${documentId}`).set(auth).expect(200);
    expectMatchesContract(documentEnvelopeSchema, documentRes.body, "GET /documents/{documentId}");

    const saveRes = await request(server)
      .patch(`/api/v1/documents/${documentId}`)
      .set(auth)
      .send({ content: "<p>契约</p>" })
      .expect(200);
    expectMatchesContract(documentEnvelopeSchema, saveRes.body, "PATCH /documents/{documentId}");

    const deleteRes = await request(server).delete(`/api/v1/projects/${projectId}`).set(auth).expect(200);
    expectMatchesContract(nullDataEnvelopeSchema, deleteRes.body, "DELETE /projects/{projectId}");
  });

  it("matches the public content contracts for both the localized and the source shapes", async () => {
    const listRes = await request(server).get("/api/v1/content/news").set("Accept-Language", "zh-CN").expect(200);
    expectMatchesContract(newsListEnvelopeSchema, listRes.body, "GET /content/news");

    const slug = listRes.body.data.articles[0].slug as string;
    const detailRes = await request(server).get(`/api/v1/content/news/${slug}`).expect(200);
    expectMatchesContract(newsArticleEnvelopeSchema, detailRes.body, "GET /content/news/{slug}");

    const pricingRes = await request(server).get("/api/v1/content/pricing").expect(200);
    expectMatchesContract(pricingEnvelopeSchema, pricingRes.body, "GET /content/pricing");

    // 写接口回显的是未折叠的双语原文，与读接口的 article 不是同一形状
    const { accessToken } = await registerAndLogin();
    const auth = { Authorization: `Bearer ${accessToken}` };
    const created = {
      slug: `contract-${Date.now()}`,
      title: { "zh-CN": "契约", "en-US": "Contract" },
      description: { "zh-CN": "契约描述", "en-US": "Contract description" },
      body: { "zh-CN": ["段落"], "en-US": ["Paragraph"] },
      publishedAt: "2026-08-31",
    };

    const createRes = await request(server).post("/api/v1/content/news").set(auth).send(created).expect(201);
    expectMatchesContract(newsSourceEnvelopeSchema, createRes.body, "POST /content/news");

    const patchRes = await request(server)
      .patch(`/api/v1/content/news/${created.slug}`)
      .set(auth)
      .send({ publishedAt: "2026-09-01" })
      .expect(200);
    expectMatchesContract(newsSourceEnvelopeSchema, patchRes.body, "PATCH /content/news/{slug}");

    const deleteRes = await request(server).delete(`/api/v1/content/news/${created.slug}`).set(auth).expect(200);
    expectMatchesContract(nullDataEnvelopeSchema, deleteRes.body, "DELETE /content/news/{slug}");
  });

  // 通用图片与头像图片共用 ImageUploadResult，但落盘目录段不同；
  // 只跑其中一个的话，另一个端点的响应形状实际从未被真实响应验证过。
  it.each([
    ["/api/v1/uploads", "POST /uploads"],
    ["/api/v1/uploads/profiles", "POST /uploads/profiles"],
  ])("matches the image upload contract on %s", async (endpoint, label) => {
    const { accessToken } = await registerAndLogin();

    // multer 只按 mimetype 白名单过滤，内容本身不参与判定，因此这里用最小的合法 PNG 头即可
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    const res = await request(server)
      .post(endpoint)
      .set("Authorization", `Bearer ${accessToken}`)
      .attach("files", png, { filename: "contract.png", contentType: "image/png" })
      .expect(200);

    expectMatchesContract(imageUploadEnvelopeSchema, res.body, label);

    for (const url of res.body.data.urls as string[]) {
      createdFiles.push(path.join(projectRoot, "uploads", url.replace(/^\/uploads\//, "")));
    }
  });

  it("rejects an unknown profile field with 400 instead of ignoring it", async () => {
    const { accessToken } = await registerAndLogin();

    // 后端 body schema 是 strict 的：未知字段返回 400 而不是被忽略。
    // 前端 UpdateProfilePayload 收敛到可写字段正是因为这条。
    // 端点特有的 401/403/404/409/410 由 error-contract.integration.test.ts 统一覆盖，
    // 400 来自全局 validate 中间件，在这里挑一个代表性端点验证即可。
    const response = await request(server)
      .patch("/api/v1/me/profile")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ notAProfileField: 1 })
      .expect(400);

    expectMatchesContract(errorEnvelopeSchema, response.body, "PATCH /me/profile → 400");
    expect(declaredStatuses("PATCH /api/v1/me/profile"), "契约里没有声明 400").toContain("400");
  });

  it("keeps aborting an unknown upload idempotent instead of erroring", async () => {
    const { accessToken } = await registerAndLogin();

    // 取消是幂等的：任务不存在或已清理时仍返回成功。契约因此刻意不声明 404，
    // 这条用例把「不 404」本身钉住 —— 否则以后有人给它加个 404，两边都不会有人发现。
    const response = await request(server)
      .delete("/api/v1/uploads/large/00000000-0000-4000-8000-000000000000")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expectMatchesContract(emptyDataEnvelopeSchema, response.body, "DELETE /uploads/large/{uploadId}（幂等取消）");
    expect(declaredStatuses("DELETE /api/v1/uploads/large/{uploadId}"), "取消是幂等的，契约不该声明 404").not.toContain(
      "404",
    );
  });

  it("matches the large upload contracts across init, chunk, status, merge and abort", async () => {
    const { accessToken } = await registerAndLogin();
    const auth = { Authorization: `Bearer ${accessToken}` };

    // 内容随机：MD5 每次运行都不同，否则第二次运行会命中上一次留下的秒传索引，
    // instant 分支被提前触发，用例就再也测不到真正的分片流程。
    const chunkSize = 1024 * 1024;
    const content = randomBytes(chunkSize);
    const fileMd5 = createHash("md5").update(content).digest("hex");
    const initBody = { fileName: "contract.bin", fileSize: content.length, chunkSize, fileMd5 };

    const initRes = await request(server).post("/api/v1/uploads/large/init").set(auth).send(initBody).expect(200);
    expectMatchesContract(largeUploadInitEnvelopeSchema, initRes.body, "POST /uploads/large/init");
    expect(initRes.body.data.instant).toBe(false);

    const uploadId = initRes.body.data.uploadId as string;

    const chunkRes = await request(server)
      .put(`/api/v1/uploads/large/${uploadId}/chunks/0`)
      .set(auth)
      .set("X-Chunk-Md5", createHash("md5").update(content).digest("hex"))
      .attach("chunk", content, { filename: "part-0.bin", contentType: "application/octet-stream" })
      .expect(200);
    expectMatchesContract(chunkAcceptedEnvelopeSchema, chunkRes.body, "PUT /uploads/large/{uploadId}/chunks/{index}");

    const statusRes = await request(server).get(`/api/v1/uploads/large/${uploadId}/status`).set(auth).expect(200);
    expectMatchesContract(largeUploadStatusEnvelopeSchema, statusRes.body, "GET /uploads/large/{uploadId}/status");
    expect(statusRes.body.data.receivedIndices).toEqual([0]);

    const mergeRes = await request(server)
      .post(`/api/v1/uploads/large/${uploadId}/merge`)
      .set(auth)
      .send({})
      .expect(200);
    expectMatchesContract(largeUploadMergeEnvelopeSchema, mergeRes.body, "POST /uploads/large/{uploadId}/merge");

    const publicUrl = mergeRes.body.data.url as string;
    createdFiles.push(
      path.join(projectRoot, "uploads", publicUrl.replace(/^\/uploads\//, "")),
      path.join(projectRoot, ".data", "large-upload-done", `${uploadId}.json`),
      path.join(projectRoot, ".data", "large-upload-hash-index", `${fileMd5}.json`),
    );

    // 合并完成后临时目录已删，status 走的是 done marker 分支——字段与上面那次并不相同
    const doneStatusRes = await request(server).get(`/api/v1/uploads/large/${uploadId}/status`).set(auth).expect(200);
    expectMatchesContract(
      largeUploadStatusEnvelopeSchema,
      doneStatusRes.body,
      "GET /uploads/large/{uploadId}/status（已完成）",
    );
    expect(doneStatusRes.body.data.status).toBe("done");

    // 同一 MD5 再 init 一次会命中秒传索引，走的是 instant 分支
    const instantRes = await request(server).post("/api/v1/uploads/large/init").set(auth).send(initBody).expect(200);
    expectMatchesContract(largeUploadInitEnvelopeSchema, instantRes.body, "POST /uploads/large/init（秒传）");
    expect(instantRes.body.data.instant).toBe(true);

    // 取消一个全新的任务：它返回空对象而不是 null，这条也在契约里
    const otherContent = randomBytes(chunkSize);
    const otherInit = await request(server)
      .post("/api/v1/uploads/large/init")
      .set(auth)
      .send({
        fileName: "contract-abort.bin",
        fileSize: otherContent.length,
        chunkSize,
        fileMd5: createHash("md5").update(otherContent).digest("hex"),
      })
      .expect(200);

    const abortRes = await request(server)
      .delete(`/api/v1/uploads/large/${otherInit.body.data.uploadId}`)
      .set(auth)
      .expect(200);
    expectMatchesContract(emptyDataEnvelopeSchema, abortRes.body, "DELETE /uploads/large/{uploadId}");
  });
});
