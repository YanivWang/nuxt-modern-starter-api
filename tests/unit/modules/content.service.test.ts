/**
 * 文件职责：内容 Service 的 Port 注入单元测试。
 * 验证读取走 ContentRepository、写操作成功后触发 ContentRevalidator，
 * 以及写操作没命中目标时不触发缓存失效。
 */
import { describe, expect, it, vi } from "vitest";

import { createContentService } from "../../../src/modules/content/content.service.js";

import type { NewsArticle } from "../../../src/modules/content/content.contract.js";
import type { ContentRepository } from "../../../src/modules/content/ports/content-repository.port.js";

const article: NewsArticle = {
  slug: "demo",
  title: { "zh-CN": "演示", "en-US": "Demo" },
  description: { "zh-CN": "摘要", "en-US": "Summary" },
  body: { "zh-CN": ["正文"], "en-US": ["Body"] },
  publishedAt: "2026-08-10",
};

/** Port 全异步，假实现也必须返回 Promise，否则测试会放过漏掉的 await。 */
function fakeRepository(overrides: Partial<ContentRepository> = {}): ContentRepository {
  return {
    listNews: vi.fn(() => Promise.resolve([article])),
    findNews: vi.fn(() => Promise.resolve(article)),
    createNews: vi.fn(() => Promise.resolve(article)),
    updateNews: vi.fn(() => Promise.resolve(article)),
    deleteNews: vi.fn(() => Promise.resolve(true)),
    getPricing: vi.fn(),
    ...overrides,
  };
}

describe("content service ports", () => {
  it("uses repository data and notifies the revalidator after a mutation", async () => {
    const revalidateNews = vi.fn();
    const service = createContentService(fakeRepository(), { revalidateNews });

    await expect(service.findNews("demo", "en-US")).resolves.toMatchObject({ title: "Demo", body: ["Body"] });
    await expect(service.createNews(article)).resolves.toBe(article);
    expect(revalidateNews).toHaveBeenCalledWith("demo");
  });

  it("skips revalidation when the write did not hit an existing article", async () => {
    const revalidateNews = vi.fn();
    const service = createContentService(
      fakeRepository({
        createNews: vi.fn(() => Promise.resolve(null)),
        updateNews: vi.fn(() => Promise.resolve(null)),
        deleteNews: vi.fn(() => Promise.resolve(false)),
      }),
      { revalidateNews },
    );

    // 冲突 / 未命中不该发缓存失效：前端会因此丢掉一份仍然有效的 SWR 缓存。
    await expect(service.createNews(article)).resolves.toBeNull();
    await expect(service.updateNews("missing", { publishedAt: "2026-08-11" })).resolves.toBeNull();
    await expect(service.deleteNews("missing")).resolves.toBe(false);
    expect(revalidateNews).not.toHaveBeenCalled();
  });
});
