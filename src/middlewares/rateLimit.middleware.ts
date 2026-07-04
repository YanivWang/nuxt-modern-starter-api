import rateLimit from "express-rate-limit";

import { fail } from "../utils/response.js";

// /health、/ready：当前 app.ts 将探针挂在全局限流之前，一般不会执行到此 skip；保留以便调整挂载顺序或复用本中间件时不误伤探针
function skipProbePaths(req: { path?: string }) {
  const p = req.path || "";
  return p === "/health" || p === "/ready";
}

export const globalRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 10000, // 最大请求数（开发期批量导入等场景临时放宽；上线前请恢复合理阈值）
  skip: skipProbePaths,
  handler: (req, res) => {
    return fail(res, 429, "请求过于频繁，请稍后再试");
  },
});

export const authRateLimitMiddleware = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 60, // 登录/注册专用窗口；略高于常规交互上限，仍防暴力枚举
  handler: (req, res) => {
    return fail(res, 429, "请求过于频繁，请稍后再试");
  },
});
