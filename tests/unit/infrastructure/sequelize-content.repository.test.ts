/**
 * 文件职责：Sequelize 内容 Adapter 的查询构造与错误映射单元测试。
 *
 * 集成测试证明读写确实落到 MySQL，但证明不了「列表有上限、按什么排序」——
 * 那需要造出上百行数据。这里直接对着 Model 的调用参数断言，
 * 让排序和 limit 在被顺手删掉时立刻变红。
 */
import { describe, expect, it, vi } from "vitest";

import { createSequelizeContentRepository } from "../../../src/infrastructure/content/sequelize-content.repository.js";

import type { NewsArticleModel } from "../../../src/modules/content/news-article.model.js";
import type { NewsArticle } from "../../../src/modules/content/content.contract.js";

const article: NewsArticle = {
  slug: "demo",
  title: { "zh-CN": "演示", "en-US": "Demo" },
  description: { "zh-CN": "摘要", "en-US": "Summary" },
  body: { "zh-CN": ["正文"], "en-US": ["Body"] },
  publishedAt: "2026-08-10",
};

/** 只实现 Adapter 真正用到的几个静态方法；其余交给类型断言。 */
function fakeModel(overrides: Record<string, unknown> = {}) {
  return {
    findAll: vi.fn(() => Promise.resolve([])),
    findOne: vi.fn(() => Promise.resolve(null)),
    create: vi.fn(() => Promise.resolve({ ...article })),
    destroy: vi.fn(() => Promise.resolve(0)),
    ...overrides,
  } as unknown as typeof NewsArticleModel;
}

describe("sequelize content repository", () => {
  it("lists newest first and never returns an unbounded result set", async () => {
    // 单独持有 mock 引用：直接断言 model.findAll 会触发 unbound-method 规则。
    const findAll = vi.fn(() => Promise.resolve([]));
    await createSequelizeContentRepository(fakeModel({ findAll })).listNews();

    expect(findAll).toHaveBeenCalledWith({
      order: [
        ["publishedAt", "DESC"],
        ["createdAt", "DESC"],
      ],
      limit: 100,
    });
  });

  it("maps a unique constraint violation to a null create instead of throwing", async () => {
    const uniqueError = Object.assign(new Error("duplicate"), { name: "SequelizeUniqueConstraintError" });
    const model = fakeModel({ create: vi.fn(() => Promise.reject(uniqueError)) });

    // slug 撞唯一索引意味着「已存在」，由 controller 翻成 409；
    // 先查后插在并发下会漏判，所以判据是索引而不是一次预查。
    await expect(createSequelizeContentRepository(model).createNews(article)).resolves.toBeNull();
  });

  it("propagates errors that are not slug conflicts", async () => {
    const model = fakeModel({ create: vi.fn(() => Promise.reject(new Error("connection lost"))) });

    // 数据库掉线不能被当成 409：那会让调用方以为是自己的 slug 重了。
    await expect(createSequelizeContentRepository(model).createNews(article)).rejects.toThrow("connection lost");
  });

  it("reports a delete that matched no row", async () => {
    const model = fakeModel({ destroy: vi.fn(() => Promise.resolve(0)) });

    await expect(createSequelizeContentRepository(model).deleteNews("missing")).resolves.toBe(false);
  });
});
