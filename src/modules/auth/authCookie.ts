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
    sameSite: "lax" as const,
    secure: AUTH_COOKIE_SECURE,
    path: "/",
    maxAge: maxAgeSeconds * 1000,
  };
}

function csrfCookieOptions(maxAgeSeconds: number) {
  return {
    ...cookieOptions(maxAgeSeconds),
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

  return timingSafeEqual(cookieBuffer, headerBuffer);
}
