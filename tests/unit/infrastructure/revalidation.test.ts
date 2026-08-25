/**
 * 文件职责：Nuxt revalidate Adapter 单元测试。
 * 覆盖新闻路径生成、已配置时的请求体与请求头，以及未配置时静默跳过。
 */
import { describe, expect, it, vi } from "vitest";

import {
  createNuxtContentRevalidator,
  getNewsRevalidatePaths,
} from "../../../src/infrastructure/revalidation/nuxt-content-revalidator.js";

describe("nuxt content revalidation adapter", () => {
  it("returns localized news paths for a slug", () => {
    expect(getNewsRevalidatePaths("starter-release")).toEqual([
      "/news",
      "/news/starter-release",
      "/en/news",
      "/en/news/starter-release",
    ]);
  });

  it("posts revalidation requests when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    createNuxtContentRevalidator({
      url: "http://localhost:3000/api/revalidate",
      secret: "test-secret",
    }).revalidateNews("demo");

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/api/revalidate", {
        method: "POST",
        headers: { "content-type": "application/json", "x-revalidate-secret": "test-secret" },
        body: JSON.stringify({ paths: ["/news", "/news/demo", "/en/news", "/en/news/demo"] }),
      });
    });
    vi.unstubAllGlobals();
  });

  it("skips revalidation when configuration is absent", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    createNuxtContentRevalidator({}).revalidateNews("demo");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
