/**
 * 文件职责：HTTP 层小工具单元测试。
 * 覆盖统一响应信封、校验结果读取和路由模板提取。
 */
import { describe, expect, it, vi } from "vitest";

import { AppError } from "../../../src/shared/errors/app-error.js";
import { expressRoutePath } from "../../../src/utils/expressRoutePath.js";
import { getValidated } from "../../../src/utils/getValidated.js";
import { fail, success } from "../../../src/utils/response.js";

import type { Request, Response } from "express";

function mockResponse() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { res: { status } as unknown as Response, status, json };
}

describe("response envelope", () => {
  it("always reports code 200 for business success, independent of the HTTP status", () => {
    const { res, status, json } = mockResponse();
    success(res, "创建成功", { id: 1 }, 201);
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith({ code: 200, message: "创建成功", data: { id: 1 } });
  });

  it("defaults data to null", () => {
    const { res, json } = mockResponse();
    success(res, "ok");
    expect(json).toHaveBeenCalledWith({ code: 200, message: "ok", data: null });
  });

  it("mirrors the HTTP status into the failure envelope", () => {
    const { res, status, json } = mockResponse();
    fail(res, 429, "请求过于频繁，请稍后再试");
    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith({ code: 429, message: "请求过于频繁，请稍后再试", data: null });
  });
});

describe("getValidated", () => {
  it("returns the validated payload", () => {
    const req = { validated: { body: { a: 1 } } } as unknown as Request;
    expect(getValidated<{ body: { a: number } }>(req).body.a).toBe(1);
  });

  it("treats a missing validate middleware as a server-side配置错误", () => {
    const req = {} as Request;
    expect(() => getValidated(req)).toThrow(AppError);
    // 该错误不暴露给客户端，避免把路由装配细节泄露出去。
    try {
      getValidated(req);
    } catch (error) {
      expect((error as AppError).expose).toBe(false);
      expect((error as AppError).code).toBe("INTERNAL");
    }
  });
});

describe("expressRoutePath", () => {
  it("returns the route template rather than the concrete URL", () => {
    const req = { route: { path: "/projects/:projectId" } } as unknown as Request;
    expect(expressRoutePath(req)).toBe("/projects/:projectId");
  });

  it("returns undefined before a route matched", () => {
    expect(expressRoutePath({} as Request)).toBeUndefined();
    expect(expressRoutePath({ route: null } as unknown as Request)).toBeUndefined();
    expect(expressRoutePath({ route: { path: 42 } } as unknown as Request)).toBeUndefined();
  });
});
