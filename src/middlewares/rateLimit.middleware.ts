/**
 * 文件职责：构造全局、认证接口和静态资源三档限流中间件。
 * 限流响应也走项目统一 { code, message, data } 格式，探针路径默认跳过。
 *
 * 计数存储由组合根注入：注入 Redis store 时阈值在整个集群内共享，
 * 不注入则回退到 express-rate-limit 的进程内内存 store（仅适合单实例）。
 */
import rateLimit from "express-rate-limit";

import {
  AUTH_RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  STATIC_RATE_LIMIT_MAX,
  STATIC_RATE_LIMIT_WINDOW_MS,
} from "../env.js";
import { fail } from "../utils/response.js";

import type { Store } from "express-rate-limit";

// /health、/ready：当前 app.ts 将探针挂在全局限流之前，一般不会执行到此 skip；保留以便调整挂载顺序或复用本中间件时不误伤探针
function skipProbePaths(req: { path?: string }) {
  const p = req.path || "";
  return p === "/health" || p === "/ready";
}

const tooManyRequests = (_req: unknown, res: Parameters<typeof fail>[0]) => fail(res, 429, "请求过于频繁，请稍后再试");

/**
 * 两个限流器共用的响应头策略。
 *
 * `standardHeaders` 发的是 RFC 草案里的 `RateLimit` / `RateLimit-Policy`，
 * 客户端可以据此自己退避；`X-RateLimit-*` 是 express-rate-limit v7 起已废弃的旧写法，
 * 同时发两套只会让消费方不知道该信哪一份。
 */
const headerOptions = { standardHeaders: "draft-7", legacyHeaders: false } as const;

export function createGlobalRateLimitMiddleware(store?: Store) {
  return rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    // v7 起 `max` 更名为 `limit`，旧名只是兼容保留。
    limit: RATE_LIMIT_MAX,
    ...headerOptions,
    skip: skipProbePaths,
    handler: tooManyRequests,
    ...(store ? { store } : {}),
  });
}

export function createAuthRateLimitMiddleware(store?: Store) {
  return rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    limit: AUTH_RATE_LIMIT_MAX,
    ...headerOptions,
    handler: tooManyRequests,
    ...(store ? { store } : {}),
  });
}

/**
 * /uploads 静态资源限流。
 *
 * 独立预算，不与业务接口共享：图片多的页面一次就是几十个资源请求，
 * 记在 API 账上会让正常浏览把接口配额烧光。额度因此宽松得多，
 * 但它存在本身才是关键——否则 /uploads 就是一条无需登录、可无限反复拉大文件的出口。
 *
 * 长期方案仍是让 Nginx/CDN 直接提供 /uploads 并在那一层限带宽；
 * 这一档是「没有 CDN 时 Node 自己也不至于裸奔」的底线。
 */
export function createStaticRateLimitMiddleware(store?: Store) {
  return rateLimit({
    windowMs: STATIC_RATE_LIMIT_WINDOW_MS,
    limit: STATIC_RATE_LIMIT_MAX,
    ...headerOptions,
    handler: tooManyRequests,
    ...(store ? { store } : {}),
  });
}

export type RateLimitMiddleware = ReturnType<typeof createGlobalRateLimitMiddleware>;
