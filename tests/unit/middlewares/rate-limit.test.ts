/**
 * 文件职责：限流中间件在计数存储故障时的行为测试。
 *
 * 守的是一条取舍：存储（Redis）不可用时放行，而不是让请求失败。
 * express-rate-limit 默认 passOnStoreError: false —— store 抛错就是 500，
 * 而全局限流挂在所有业务路由之前，于是一次 Redis 抖动会变成整个 API 每个请求都 500。
 * 限流是保护性措施而非授权控制，把依赖抖动放大成全站不可用是更坏的结果。
 */
import { describe, expect, it, vi } from "vitest";

import { createGlobalRateLimitMiddleware } from "../../../src/middlewares/rateLimit.middleware.js";

import type { Store } from "express-rate-limit";

/** 连接断开时 rate-limit-redis 的 sendCommand 就是这样 reject 的 */
function brokenStore(): Store {
  return {
    increment: () => Promise.reject(new Error("Connection is closed.")),
    decrement: () => Promise.resolve(),
    resetKey: () => Promise.resolve(),
  };
}

// app.get 供 express-rate-limit 读 trust proxy 设置；缺了它会先抛一个无关的校验错误
const fakeRequest = () => ({
  ip: "203.0.113.7",
  path: "/api/v1/projects",
  method: "GET",
  headers: {},
  app: { get: () => false },
});

const fakeResponse = () => {
  const res = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader: vi.fn(),
    getHeader: vi.fn(),
    removeHeader: vi.fn(),
    status: vi.fn(() => res),
    json: vi.fn(() => res),
    send: vi.fn(() => res),
    on: vi.fn(),
  };
  return res;
};

describe("rate limit store failures", () => {
  it("lets the request through instead of turning a Redis blip into a site-wide 500", async () => {
    const middleware = createGlobalRateLimitMiddleware(brokenStore());
    const next = vi.fn();

    await new Promise<void>((resolve) => {
      next.mockImplementation(() => resolve());
      void middleware(fakeRequest() as never, fakeResponse() as never, next);
    });

    // next() 必须无参数：带上 error 就会走到错误中间件变成 500
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });
});
