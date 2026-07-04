import { AUTH_COOKIE_SECURE } from "../env.js";

import type { AuthTokenPair } from "../services/auth-session.service.js";
import type { Request, Response } from "express";

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: AUTH_COOKIE_SECURE,
    path: "/",
    maxAge: maxAgeSeconds * 1000,
  };
}

export function setAuthCookies(res: Response, pair: AuthTokenPair): void {
  res.cookie(ACCESS_COOKIE, pair.accessToken, cookieOptions(pair.accessTokenExpiresIn));
  res.cookie(REFRESH_COOKIE, pair.refreshToken, cookieOptions(pair.refreshTokenExpiresIn));
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_COOKIE, { path: "/" });
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
