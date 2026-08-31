/**
 * 文件职责：内容 Service 的 Port 注入单元测试。
 * 验证读取走 ContentRepository、写操作成功后触发 ContentRevalidator。
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

describe("content service ports", () => {
  it("uses repository data and notifies the revalidator after a mutation", () => {
    const repository = {
      listNews: vi.fn(() => [article]),
      findNews: vi.fn(() => article),
      createNews: vi.fn(() => article),
      updateNews: vi.fn(() => article),
      deleteNews: vi.fn(() => true),
      getPricing: vi.fn(),
    } as unknown as ContentRepository;
    const revalidateNews = vi.fn();
    const service = createContentService(repository, { revalidateNews });

    expect(service.findNews("demo", "en-US")).toMatchObject({ title: "Demo", body: ["Body"] });
    expect(service.createNews(article)).toBe(article);
    expect(revalidateNews).toHaveBeenCalledWith("demo");
  });
});
