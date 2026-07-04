/**
 * 文件职责：配置全局限流和认证接口限流。
 * 限流响应也走项目统一 { code, msg } 格式，探针路径默认跳过。
 */
import rateLimit from "express-rate-limit";

import { AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from "../env.js";
import { fail } from "../utils/response.js";

// /health、/ready：当前 app.ts 将探针挂在全局限流之前，一般不会执行到此 skip；保留以便调整挂载顺序或复用本中间件时不误伤探针
function skipProbePaths(req: { path?: string }) {
  const p = req.path || "";
  return p === "/health" || p === "/ready";
}

export const globalRateLimitMiddleware = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  skip: skipProbePaths,
  handler: (req, res) => {
    return fail(res, 429, "请求过于频繁，请稍后再试");
  },
});

export const authRateLimitMiddleware = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT_MAX,
  handler: (req, res) => {
    return fail(res, 429, "请求过于频繁，请稍后再试");
  },
});
