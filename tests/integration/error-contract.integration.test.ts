/**
 * 文件职责：证明每个端点声明的错误状态码都能被真实 provoke 出来，且响应体符合 ErrorBody。
 *
 * 这一层解决的是「过度声明」：漏声明一个状态码，客户端会漏掉一条分支；
 * 而多声明一个到不了的状态码，客户端会为一个永远不会发生的情况写处理逻辑，
 * 契约同样是假的，只是假在另一个方向。前者靠逐条断言「实测到的状态码必须已声明」，
 * 后者靠文件末尾那条覆盖断言：契约里声明的每个端点特有状态码都必须在这里被 provoke 过。
 *
 * 400 / 429 / 500 不逐端点 provoke：它们分别来自全局挂载的 validate、限流与错误中间件，
 * 对所有端点结构性成立，逐个触发只是在重复测同一段中间件（400 已在
 * response-contract 里用 PATCH /me/profile 的 strict body 覆盖过）。
 *
 * 大文件上传的 409 / 410 通过直接改写磁盘上的 meta.json 触发。这不是造假：
 * 进程在合并中途崩溃，留在磁盘上的就正是 status="merging" 且会话仍在的状态；
 * 任务放置超过 TTL，留下的就正是一个 createdAt 很旧的 meta。
 */
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestRuntime,
  promoteToAdmin,
  resetRedisState,
  startTestServer,
  stopTestServer,
} from "./support/test-runtime.js";
import { generateOpenApiSpec } from "../../src/openapi.js";
import { projectRoot } from "../../src/utils/projectRoot.js";
import { errorEnvelopeSchema } from "../../src/shared/http/api-envelope.js";
import { LARGE_UPLOAD_CHUNKS_ROOT } from "../../src/infrastructure/storage/local-large-upload.adapter.js";

import type { AppRuntime } from "../../src/runtime.js";
import type { Server } from "node:http";

let server: Server;
let runtime: AppRuntime;

const spec = generateOpenApiSpec();

/** 端点特有的错误码。400/429/500 来自全局中间件，见文件头说明。 */
const ENDPOINT_SPECIFIC = ["401", "403", "404", "409", "410"];

/** 已经用真实请求触发过的 `${endpoint} ${status}`。 */
const provoked = new Set<string>();

/**
 * 大文件用例留下的落盘产物，afterAll 逐个删除。
 *
 * 一次 init 会写两处：.data/large-upload-chunks 下的分片目录，和 .data 下的会话文件。
 * 这里的用例大多故意停在错误分支上，走不到 merge/abort（那两个才会自己清理），
 * 所以两处都必须显式登记 —— 只删目录的话，.data 会随着每轮测试单调增长。
 */
const createdPaths: string[] = [];

const UNKNOWN_UUID = "00000000-0000-4000-8000-000000000000";
const CHUNK_SIZE = 1024 * 1024;

function uniqueUsername() {
  return `errc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const md5 = (buffer: Buffer) => createHash("md5").update(buffer).digest("hex");

function declaredStatuses(endpoint: string): string[] {
  const [method, routePath] = endpoint.split(" ") as [string, string];
  const operation = spec.paths[routePath]?.[method.toLowerCase()];

  expect(operation, `契约里没有 ${endpoint}`).toBeDefined();

  return Object.keys(operation.responses);
}

/** 断言一次真实的错误响应：状态码、响应体形状，以及「这个状态码在契约里声明过」。 */
function expectDeclaredError(endpoint: string, status: number, response: { status: number; body: unknown }) {
  const label = `${endpoint} → ${status}`;

  expect(response.status, `${label}：真实状态码与预期不符`).toBe(status);

  const parsed = errorEnvelopeSchema.safeParse(response.body);
  expect(parsed.success ? [] : parsed.error.issues, `${label}：错误响应体不符合 ErrorBody`).toEqual([]);
  // parse 会剥掉未声明的键，剥完还相等才说明没有契约之外的字段
  expect(parsed.data, `${label}：错误响应里出现了契约未声明的字段`).toEqual(response.body);

  expect(declaredStatuses(endpoint), `${label}：契约里没有声明这个状态码`).toContain(String(status));

  provoked.add(`${endpoint} ${status}`);
}

async function registerAndLogin() {
  const username = uniqueUsername();
  const password = "password123";

  await request(server).post("/api/v1/register").send({ username, password }).expect(200);
  const login = await request(server).post("/api/v1/login").send({ username, password }).expect(200);

  return {
    username,
    password,
    accessToken: login.body.data.accessToken as string,
    cookies: login.headers["set-cookie"] as unknown as string[],
  };
}

function metaPath(fileMd5: string, uploadId: string) {
  return path.join(LARGE_UPLOAD_CHUNKS_ROOT, fileMd5, uploadId, "meta.json");
}

async function patchMeta(fileMd5: string, uploadId: string, patch: Record<string, unknown>) {
  const file = metaPath(fileMd5, uploadId);
  const meta = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
  await fs.writeFile(file, JSON.stringify({ ...meta, ...patch }), "utf8");
}

/** 建一个真实的分片上传任务；chunkTotal 决定 fileSize，用于制造「分片未就绪」。 */
async function initUpload(accessToken: string, chunkTotal = 1) {
  const content = randomBytes(CHUNK_SIZE);
  const fileMd5 = md5(content);
  const response = await request(server)
    .post("/api/v1/uploads/large/init")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      fileName: "error-contract.bin",
      fileSize: CHUNK_SIZE * chunkTotal,
      chunkSize: CHUNK_SIZE,
      fileMd5,
    })
    .expect(200);

  const uploadId = response.body.data.uploadId as string;
  createdPaths.push(
    path.join(LARGE_UPLOAD_CHUNKS_ROOT, fileMd5),
    path.join(projectRoot, ".data", "large-upload-sessions", `${uploadId}.json`),
    // 后两处只有走到 merge 才会产生；一并登记，免得将来补了 merge 用例又漏掉
    path.join(projectRoot, ".data", "large-upload-done", `${uploadId}.json`),
    path.join(projectRoot, ".data", "large-upload-hash-index", `${fileMd5}.json`),
  );

  return { uploadId, fileMd5, content };
}

const attachChunk = (req: request.Test, content: Buffer) =>
  req
    .set("X-Chunk-Md5", md5(content))
    .attach("chunk", content, { filename: "part-0.bin", contentType: "application/octet-stream" });

describe("API error contract", () => {
  beforeAll(async () => {
    runtime = createTestRuntime();
    server = startTestServer(runtime);
    await runtime.connect();
    await resetRedisState(runtime);
  });

  afterAll(async () => {
    const { Document, Project, Workspace, UserRefreshToken, UserProfile, User } = runtime.database.models;
    await Document.destroy({ where: {} }).catch(() => {});
    await Project.destroy({ where: {} }).catch(() => {});
    await Workspace.destroy({ where: {} }).catch(() => {});
    await UserRefreshToken.destroy({ where: {} }).catch(() => {});
    await UserProfile.destroy({ where: {} }).catch(() => {});
    await User.destroy({ where: {} }).catch(() => {});
    for (const target of createdPaths) {
      await fs.rm(target, { recursive: true, force: true }).catch(() => {});
    }
    await stopTestServer(server);
    await runtime.disconnect();
  });

  it("returns 401 on every endpoint that declares bearer auth", async () => {
    const secured = Object.entries(spec.paths).flatMap(([routePath, operations]) =>
      Object.entries(operations)
        .filter(([, operation]) => operation.security)
        .map(([method]) => ({ endpoint: `${method.toUpperCase()} ${routePath}`, method, routePath })),
    );

    expect(secured.length, "契约里应当有需要鉴权的端点").toBeGreaterThan(0);

    for (const { endpoint, method, routePath } of secured) {
      // auth 中间件排在 validate 之前，因此路径参数填什么都不影响 401
      const concrete = routePath.replace("{uploadId}", UNKNOWN_UUID).replace(/\{[^}]+\}/g, "placeholder");
      const response = await request(server)[method.toLowerCase() as "get"](concrete);

      expectDeclaredError(endpoint, 401, response);
    }
  });

  it("returns 401 for bad credentials and for an unusable refresh token", async () => {
    const { username } = await registerAndLogin();

    expectDeclaredError(
      "POST /api/v1/login",
      401,
      await request(server).post("/api/v1/login").send({ username, password: "wrong-password" }),
    );
    expectDeclaredError(
      "POST /api/v1/refresh",
      401,
      await request(server).post("/api/v1/refresh").send({ refreshToken: "not-a-real-token" }),
    );
  });

  it("returns 403 when a cookie-borne refresh token comes without a CSRF header", async () => {
    const { cookies } = await registerAndLogin();

    // 走 cookie 而不是 body 才会触发 CSRF 校验
    expectDeclaredError(
      "POST /api/v1/refresh",
      403,
      await request(server).post("/api/v1/refresh").set("Cookie", cookies).send({}),
    );
  });

  it("returns 403 when a logged-in account without the admin role writes public content", async () => {
    // 这三条改的是所有匿名访客都会看到的公开内容，不是调用者自己的资源。
    // 只校验「已登录」的话，任何人注册一个账号就能删掉全站新闻。
    const outsider = await registerAndLogin();
    const auth = { Authorization: `Bearer ${outsider.accessToken}` };
    const article = {
      slug: `forbidden-${Date.now()}`,
      title: { "zh-CN": "越权", "en-US": "Forbidden" },
      description: { "zh-CN": "越权", "en-US": "Forbidden" },
      body: { "zh-CN": ["段落"], "en-US": ["Paragraph"] },
      publishedAt: "2026-09-01",
    };

    expectDeclaredError(
      "POST /api/v1/content/news",
      403,
      await request(server).post("/api/v1/content/news").set(auth).send(article),
    );
    expectDeclaredError(
      "PATCH /api/v1/content/news/{slug}",
      403,
      await request(server).patch(`/api/v1/content/news/${article.slug}`).set(auth).send({ publishedAt: "2026-09-02" }),
    );
    expectDeclaredError(
      "DELETE /api/v1/content/news/{slug}",
      403,
      await request(server).delete(`/api/v1/content/news/${article.slug}`).set(auth),
    );

    // 403 不能只是拦住了响应：被拒绝的写入不能在内容仓库里留下任何痕迹
    await request(server).get(`/api/v1/content/news/${article.slug}`).expect(404);
  });

  it("returns 404 for resources that do not exist or belong to someone else", async () => {
    const owner = await registerAndLogin();
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    // 内容写接口的授权排在业务查找之前，普通账号只会拿到 403；
    // 要证明它们真的会 404，调用者必须先是管理员。
    await promoteToAdmin(runtime, owner.username);

    expectDeclaredError(
      "GET /api/v1/content/news/{slug}",
      404,
      await request(server).get("/api/v1/content/news/no-such-article"),
    );

    for (const [endpoint, run] of [
      [
        "PATCH /api/v1/content/news/{slug}",
        () =>
          request(server).patch("/api/v1/content/news/no-such-article").set(auth).send({ publishedAt: "2026-09-01" }),
      ],
      [
        "DELETE /api/v1/content/news/{slug}",
        () => request(server).delete("/api/v1/content/news/no-such-article").set(auth),
      ],
      ["GET /api/v1/projects/{projectId}", () => request(server).get(`/api/v1/projects/${UNKNOWN_UUID}`).set(auth)],
      [
        "PATCH /api/v1/projects/{projectId}",
        () => request(server).patch(`/api/v1/projects/${UNKNOWN_UUID}`).set(auth).send({ title: "x" }),
      ],
      [
        "DELETE /api/v1/projects/{projectId}",
        () => request(server).delete(`/api/v1/projects/${UNKNOWN_UUID}`).set(auth),
      ],
      ["GET /api/v1/documents/{documentId}", () => request(server).get(`/api/v1/documents/${UNKNOWN_UUID}`).set(auth)],
      [
        "PATCH /api/v1/documents/{documentId}",
        () => request(server).patch(`/api/v1/documents/${UNKNOWN_UUID}`).set(auth).send({ content: "x" }),
      ],
      [
        "GET /api/v1/uploads/large/{uploadId}/status",
        () => request(server).get(`/api/v1/uploads/large/${UNKNOWN_UUID}/status`).set(auth),
      ],
      [
        "POST /api/v1/uploads/large/{uploadId}/merge",
        () => request(server).post(`/api/v1/uploads/large/${UNKNOWN_UUID}/merge`).set(auth).send({}),
      ],
      [
        "PUT /api/v1/uploads/large/{uploadId}/chunks/{chunkIndex}",
        () =>
          attachChunk(
            request(server).put(`/api/v1/uploads/large/${UNKNOWN_UUID}/chunks/0`).set(auth),
            randomBytes(CHUNK_SIZE),
          ),
      ],
    ] as Array<[string, () => Promise<{ status: number; body: unknown }>]>) {
      expectDeclaredError(endpoint, 404, await run());
    }
  });

  it("returns 403 when an upload task belongs to another user", async () => {
    const owner = await registerAndLogin();
    const intruder = await registerAndLogin();
    const intruderAuth = { Authorization: `Bearer ${intruder.accessToken}` };
    const { uploadId, content } = await initUpload(owner.accessToken);

    expectDeclaredError(
      "GET /api/v1/uploads/large/{uploadId}/status",
      403,
      await request(server).get(`/api/v1/uploads/large/${uploadId}/status`).set(intruderAuth),
    );
    expectDeclaredError(
      "POST /api/v1/uploads/large/{uploadId}/merge",
      403,
      await request(server).post(`/api/v1/uploads/large/${uploadId}/merge`).set(intruderAuth).send({}),
    );
    expectDeclaredError(
      "DELETE /api/v1/uploads/large/{uploadId}",
      403,
      await request(server).delete(`/api/v1/uploads/large/${uploadId}`).set(intruderAuth),
    );
    expectDeclaredError(
      "PUT /api/v1/uploads/large/{uploadId}/chunks/{chunkIndex}",
      403,
      await attachChunk(request(server).put(`/api/v1/uploads/large/${uploadId}/chunks/0`).set(intruderAuth), content),
    );
  });

  it("returns 409 on duplicate resources and on an upload that is mid-merge", async () => {
    const user = await registerAndLogin();
    const auth = { Authorization: `Bearer ${user.accessToken}` };
    await promoteToAdmin(runtime, user.username);

    expectDeclaredError(
      "POST /api/v1/register",
      409,
      await request(server).post("/api/v1/register").send({ username: user.username, password: "password123" }),
    );

    const slug = `error-contract-${Date.now()}`;
    const article = {
      slug,
      title: { "zh-CN": "冲突", "en-US": "Conflict" },
      description: { "zh-CN": "冲突", "en-US": "Conflict" },
      body: { "zh-CN": ["段落"], "en-US": ["Paragraph"] },
      publishedAt: "2026-08-31",
    };
    await request(server).post("/api/v1/content/news").set(auth).send(article).expect(201);
    expectDeclaredError(
      "POST /api/v1/content/news",
      409,
      await request(server).post("/api/v1/content/news").set(auth).send(article),
    );
    await request(server).delete(`/api/v1/content/news/${slug}`).set(auth).expect(200);

    // 声明了两个分片却一个都没传：merge 校验分片就绪时冲突
    const incomplete = await initUpload(user.accessToken, 2);
    expectDeclaredError(
      "POST /api/v1/uploads/large/{uploadId}/merge",
      409,
      await request(server).post(`/api/v1/uploads/large/${incomplete.uploadId}/merge`).set(auth).send({}),
    );

    // 进程在合并中途崩溃，磁盘上留下的就是这个状态：status=merging 且会话仍在
    const merging = await initUpload(user.accessToken);
    await patchMeta(merging.fileMd5, merging.uploadId, { status: "merging" });
    expectDeclaredError(
      "PUT /api/v1/uploads/large/{uploadId}/chunks/{chunkIndex}",
      409,
      await attachChunk(
        request(server).put(`/api/v1/uploads/large/${merging.uploadId}/chunks/0`).set(auth),
        merging.content,
      ),
    );
    expectDeclaredError(
      "POST /api/v1/uploads/large/{uploadId}/merge",
      409,
      await request(server).post(`/api/v1/uploads/large/${merging.uploadId}/merge`).set(auth).send({}),
    );
  });

  it("returns 410 once an upload task has outlived its TTL", async () => {
    const user = await registerAndLogin();
    const auth = { Authorization: `Bearer ${user.accessToken}` };
    const { uploadId, fileMd5, content } = await initUpload(user.accessToken);

    // TTL 是 24 小时，集成测试等不起；把 createdAt 改成两天前，
    // 与「任务放置过久后客户端才回来续传」在磁盘上是同一个状态
    await patchMeta(fileMd5, uploadId, {
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    });

    expectDeclaredError(
      "GET /api/v1/uploads/large/{uploadId}/status",
      410,
      await request(server).get(`/api/v1/uploads/large/${uploadId}/status`).set(auth),
    );
    expectDeclaredError(
      "POST /api/v1/uploads/large/{uploadId}/merge",
      410,
      await request(server).post(`/api/v1/uploads/large/${uploadId}/merge`).set(auth).send({}),
    );
    expectDeclaredError(
      "PUT /api/v1/uploads/large/{uploadId}/chunks/{chunkIndex}",
      410,
      await attachChunk(request(server).put(`/api/v1/uploads/large/${uploadId}/chunks/0`).set(auth), content),
    );
  });

  // 必须排在最后：它检查的是上面所有用例累计触发到的状态码
  it("provokes every endpoint-specific error status the contract declares", () => {
    const unproven: string[] = [];

    for (const [routePath, operations] of Object.entries(spec.paths)) {
      if (!routePath.startsWith("/api/")) continue;

      for (const [method, operation] of Object.entries(operations)) {
        const endpoint = `${method.toUpperCase()} ${routePath}`;
        for (const status of Object.keys(operation.responses)) {
          if (!ENDPOINT_SPECIFIC.includes(status)) continue;
          if (!provoked.has(`${endpoint} ${status}`)) unproven.push(`${endpoint} ${status}`);
        }
      }
    }

    expect(unproven, "契约声明了这些状态码，但没有任何用例能真的触发它们——要么补用例，要么这个声明本身是错的").toEqual(
      [],
    );
  });
});
