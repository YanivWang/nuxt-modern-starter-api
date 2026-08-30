/**
 * 文件职责：构造全局限流和认证接口限流中间件。
 * 限流响应也走项目统一 { code, message, data } 格式，探针路径默认跳过。
 *
 * 计数存储由组合根注入：注入 Redis store 时阈值在整个集群内共享，
 * 不注入则回退到 express-rate-limit 的进程内内存 store（仅适合单实例）。
 */
import rateLimit from "express-rate-limit";

import { AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from "../env.js";
import { fail } from "../utils/response.js";

import type { Store } from "express-rate-limit";

// /health、/ready：当前 app.ts 将探针挂在全局限流之前，一般不会执行到此 skip；保留以便调整挂载顺序或复用本中间件时不误伤探针
function skipProbePaths(req: { path?: string }) {
  const p = req.path || "";
  return p === "/health" || p === "/ready";
}

const tooManyRequests = (_req: unknown, res: Parameters<typeof fail>[0]) => fail(res, 429, "请求过于频繁，请稍后再试");

export function createGlobalRateLimitMiddleware(store?: Store) {
  return rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
    skip: skipProbePaths,
    handler: tooManyRequests,
    ...(store ? { store } : {}),
  });
}

export function createAuthRateLimitMiddleware(store?: Store) {
  return rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    max: AUTH_RATE_LIMIT_MAX,
    handler: tooManyRequests,
    ...(store ? { store } : {}),
  });
}

export type RateLimitMiddleware = ReturnType<typeof createGlobalRateLimitMiddleware>;
