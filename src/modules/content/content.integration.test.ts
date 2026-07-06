/**
 * 文件职责：公开内容 API 集成测试。
 */
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

import type { Express } from "express";

let app: Express;

describe("public content API", () => {
  beforeAll(async () => {
    const appModule = await import("../../app.js");
    app = appModule.default;
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
});
