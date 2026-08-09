/**
 * 文件职责：公开内容 API 集成测试。
 */
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createTestRuntime } from "./support/test-runtime.js";

import type { AppRuntime } from "../../src/runtime.js";
import type { Express } from "express";

let app: Express;
let runtime: AppRuntime;

function uniqueSlug() {
  return `news-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function uniqueUsername() {
  return `content_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function cleanDatabase() {
  await runtime.database.models.UserRefreshToken.destroy({ where: {} });
  await runtime.database.models.UserProfile.destroy({ where: {} });
  await runtime.database.models.User.destroy({ where: {} });
}

async function registerAndLogin() {
  const username = uniqueUsername();
  const password = "password123";

  await request(app).post("/api/register").send({ username, password }).expect(200);
  const loginRes = await request(app).post("/api/login").send({ username, password }).expect(200);

  return {
    accessToken: loginRes.body.data.accessToken as string,
  };
}

describe("public content API", () => {
  beforeAll(async () => {
    runtime = createTestRuntime();
    app = runtime.app;
    await runtime.connect();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanDatabase().catch(() => {});
    await runtime.disconnect();
  });

  it("returns localized news list without auth", async () => {
    const zhRes = await request(app).get("/api/content/news").set("Accept-Language", "zh-CN").expect(200);
    const enRes = await request(app).get("/api/content/news").set("Accept-Language", "en-US").expect(200);

    expect(zhRes.body).toEqual({
      code: 200,
      message: "获取新闻列表成功",
      data: {
        articles: expect.any(Array),
      },
    });
    expect(zhRes.body.data.articles.length).toBeGreaterThan(0);
    expect(zhRes.body.data.articles[0]).toEqual(
      expect.objectContaining({
        slug: expect.any(String),
        title: expect.any(String),
        description: expect.any(String),
        publishedAt: expect.any(String),
      }),
    );
    expect(zhRes.body.data.articles[0].title).not.toBe(enRes.body.data.articles[0].title);
  });

  it("returns localized news detail and 404 for unknown slug", async () => {
    const detailRes = await request(app)
      .get("/api/content/news/starter-release")
      .set("Accept-Language", "zh-CN")
      .expect(200);

    expect(detailRes.body.data.article).toEqual(
      expect.objectContaining({
        slug: "starter-release",
        title: expect.any(String),
        description: expect.any(String),
        body: expect.any(Array),
        publishedAt: expect.any(String),
      }),
    );

    const missingRes = await request(app).get("/api/content/news/unknown-slug").expect(404);

    expect(missingRes.body).toEqual({
      code: 404,
      message: "新闻不存在",
      data: null,
    });
  });

  it("returns localized pricing page content without auth", async () => {
    const zhRes = await request(app).get("/api/content/pricing").set("Accept-Language", "zh-CN").expect(200);
    const enRes = await request(app).get("/api/content/pricing").set("Accept-Language", "en-US").expect(200);

    expect(zhRes.body).toEqual({
      code: 200,
      message: "获取定价页内容成功",
      data: {
        pricing: expect.any(Object),
      },
    });
    expect(zhRes.body.data.pricing.plans).toHaveLength(3);
    expect(zhRes.body.data.pricing.plans[1]).toEqual(
      expect.objectContaining({
        key: "growth",
        featured: true,
        ctaPath: "/help",
        features: expect.any(Array),
      }),
    );
    expect(zhRes.body.data.pricing.title).not.toBe(enRes.body.data.pricing.title);
  });

  it("creates, updates, deletes news and triggers revalidation", async () => {
    const slug = uniqueSlug();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const { accessToken } = await registerAndLogin();

    const createPayload = {
      slug,
      title: {
        "zh-CN": "测试新闻标题",
        "en-US": "Test news title",
      },
      description: {
        "zh-CN": "测试新闻摘要",
        "en-US": "Test news summary",
      },
      body: {
        "zh-CN": ["第一段中文正文"],
        "en-US": ["First English paragraph"],
      },
      publishedAt: "2026-07-08",
    };

    const createRes = await request(app)
      .post("/api/content/news")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(createPayload)
      .expect(201);

    expect(createRes.body.data.article.slug).toBe(slug);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          paths: ["/news", `/news/${slug}`, "/en/news", `/en/news/${slug}`],
        }),
      }),
    );

    const patchRes = await request(app)
      .patch(`/api/content/news/${slug}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        description: {
          "zh-CN": "更新后的摘要",
          "en-US": "Updated summary",
        },
      })
      .expect(200);

    expect(patchRes.body.data.article.description["zh-CN"]).toBe("更新后的摘要");

    await request(app).delete(`/api/content/news/${slug}`).set("Authorization", `Bearer ${accessToken}`).expect(200);

    const missingRes = await request(app).get(`/api/content/news/${slug}`).expect(404);
    expect(missingRes.body.message).toBe("新闻不存在");
  });

  it("rejects news mutations without auth", async () => {
    await request(app)
      .post("/api/content/news")
      .send({
        slug: "unauthorized-news",
        title: { "zh-CN": "x", "en-US": "x" },
        description: { "zh-CN": "x", "en-US": "x" },
        body: { "zh-CN": ["x"], "en-US": ["x"] },
        publishedAt: "2026-07-08",
      })
      .expect(401);
  });
});
