/**
 * 文件职责：requestId 中间件的取值规则测试。
 *
 * requestId 会进每一条日志并原样回写响应头，是完全由调用方提供的文本。
 * 只截断长度而不限字符集，等于允许外部往日志里塞任意内容。
 */
import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { requestIdMiddleware } from "../../../src/middlewares/requestId.middleware.js";

import type { Request, Response } from "express";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function run(incoming?: string) {
  const req = { get: (name: string) => (name === "x-request-id" ? incoming : undefined) } as unknown as Request;
  // setHeader 单独持有引用：直接从 res 上取会触发 unbound-method（把方法与其对象分离）
  const setHeader = vi.fn();
  const res = { setHeader } as unknown as Response;
  const next = vi.fn();

  requestIdMiddleware(req, res, next);

  return { requestId: req.requestId, setHeader, next };
}

describe("requestIdMiddleware", () => {
  it("passes through an upstream id with a sane shape", () => {
    const upstream = `trace-${randomUUID()}`;
    const { requestId, setHeader } = run(upstream);

    expect(requestId).toBe(upstream);
    expect(setHeader).toHaveBeenCalledWith("X-Request-Id", upstream);
  });

  it("generates its own id when the upstream value is not a plain token", () => {
    // 这些都不该被原样写进日志与响应头
    const rejected = ["id with spaces", 'id"with"quotes', "id\twith\ttabs", "中文注入", "a".repeat(129), "", "   "];

    for (const value of rejected) {
      const { requestId } = run(value);
      expect(requestId, `${JSON.stringify(value)} 不应被透传`).not.toBe(value);
      expect(requestId).toMatch(UUID_RE);
    }
  });

  it("generates an id when the header is absent", () => {
    expect(run().requestId).toMatch(UUID_RE);
  });

  it("always continues the chain", () => {
    expect(run("ok-1").next).toHaveBeenCalledTimes(1);
  });
});
