/**
 * 文件职责：认证 Cookie 解析的健壮性与 CSRF 比较单元测试。
 * 重点覆盖畸形 Cookie —— 该输入曾能让认证中间件抛出 URIError 并终止进程。
 */
import { describe, expect, it } from "vitest";

import { csrfTokensMatch, readAccessTokenCookie, readCookie } from "../../../src/modules/auth/authCookie.js";

import type { Request } from "express";

function requestWith(cookie?: string, headers: Record<string, string> = {}): Request {
  return {
    headers: cookie === undefined ? { ...headers } : { cookie, ...headers },
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as Request;
}

describe("auth cookie parsing", () => {
  it("reads a normal cookie value", () => {
    expect(readAccessTokenCookie(requestWith("access_token=abc.def.ghi"))).toBe("abc.def.ghi");
  });

  it("decodes percent-encoded values", () => {
    expect(readCookie(requestWith("k=a%20b"), "k")).toBe("a b");
  });

  it("keeps values that legitimately contain '='", () => {
    expect(readCookie(requestWith("k=YWJj=="), "k")).toBe("YWJj==");
  });

  it.each(["%", "%zz", "%E0%A4%A", "abc%"])(
    "returns undefined instead of throwing on malformed encoding %j",
    (malformed) => {
      expect(() => readAccessTokenCookie(requestWith(`access_token=${malformed}`))).not.toThrow();
      expect(readAccessTokenCookie(requestWith(`access_token=${malformed}`))).toBeUndefined();
    },
  );

  it("returns undefined when the header is absent or the name does not match", () => {
    expect(readAccessTokenCookie(requestWith())).toBeUndefined();
    expect(readAccessTokenCookie(requestWith("other=1"))).toBeUndefined();
  });
});

describe("csrf double submit comparison", () => {
  it("matches when cookie and header carry the same token", () => {
    expect(csrfTokensMatch(requestWith("csrf_token=tok123", { "x-csrf-token": "tok123" }))).toBe(true);
  });

  it("rejects mismatched, missing, or differently sized tokens", () => {
    expect(csrfTokensMatch(requestWith("csrf_token=tok123", { "x-csrf-token": "tok999" }))).toBe(false);
    expect(csrfTokensMatch(requestWith("csrf_token=tok123"))).toBe(false);
    expect(csrfTokensMatch(requestWith(undefined, { "x-csrf-token": "tok123" }))).toBe(false);
    expect(csrfTokensMatch(requestWith("csrf_token=short", { "x-csrf-token": "muchlongertoken" }))).toBe(false);
  });

  it("does not throw when the csrf cookie itself is malformed", () => {
    expect(() => csrfTokensMatch(requestWith("csrf_token=%", { "x-csrf-token": "%" }))).not.toThrow();
  });
});
