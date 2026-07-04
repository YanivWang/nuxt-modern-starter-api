/**
 * 文件职责：认证 Cookie 与 CSRF token 的读写工具。
 * access/refresh token 写入 httpOnly Cookie；csrf_token 允许前端读取，用于双提交校验。
 */
import { randomBytes, timingSafeEqual } from "node:crypto";

import { AUTH_COOKIE_SECURE } from "../../env.js";

import type { AuthTokenPair } from "./auth-session.service.js";
import type { Request, Response } from "express";

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";
const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    // Lax 允许常见同站跳转携带 Cookie，同时降低第三方站点发起跨站写请求的默认风险。
    sameSite: "lax" as const,
    secure: AUTH_COOKIE_SECURE,
    path: "/",
    maxAge: maxAgeSeconds * 1000,
  };
}

function csrfCookieOptions(maxAgeSeconds: number) {
  return {
    ...cookieOptions(maxAgeSeconds),
    // 双提交 Cookie：前端需读取该值并放入 X-CSRF-Token，服务端比较 Cookie 与 Header。
    httpOnly: false,
  };
}

function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function setAuthCookies(res: Response, pair: AuthTokenPair): void {
  res.cookie(ACCESS_COOKIE, pair.accessToken, cookieOptions(pair.accessTokenExpiresIn));
  res.cookie(REFRESH_COOKIE, pair.refreshToken, cookieOptions(pair.refreshTokenExpiresIn));
  res.cookie(CSRF_COOKIE, createCsrfToken(), csrfCookieOptions(pair.refreshTokenExpiresIn));
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_COOKIE, { path: "/" });
  res.clearCookie(CSRF_COOKIE, { path: "/" });
}

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;

  for (const part of raw.split(";")) {
    const [rawName, ...valueParts] = part.trim().split("=");
    if (rawName !== name) continue;
    const rawValue = valueParts.join("=");
    if (!rawValue) return undefined;
    return decodeURIComponent(rawValue);
  }

  return undefined;
}

export function readAccessTokenCookie(req: Request): string | undefined {
  return readCookie(req, ACCESS_COOKIE);
}

export function readRefreshTokenCookie(req: Request): string | undefined {
  return readCookie(req, REFRESH_COOKIE);
}

export function readCsrfTokenCookie(req: Request): string | undefined {
  return readCookie(req, CSRF_COOKIE);
}

export function csrfTokensMatch(req: Request): boolean {
  const cookieToken = readCsrfTokenCookie(req);
  const headerToken = req.get(CSRF_HEADER);
  if (!cookieToken || !headerToken) return false;

  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);
  if (cookieBuffer.length !== headerBuffer.length) return false;

  // 使用常量时间比较，避免 token 不同时泄露过多比较进度信息。
  return timingSafeEqual(cookieBuffer, headerBuffer);
}
