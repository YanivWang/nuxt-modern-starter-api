/**
 * 文件职责：暴露 Prometheus 指标，提供 RED（Rate / Error / Duration）三类核心信号。
 *
 * 只靠日志排查生产问题意味着「有人去看」才能发现异常；指标让告警可以在无人值守时触发。
 * 标签一律使用路由模板而不是真实 URL：/api/projects/:projectId 是一个时间序列，
 * 而 /api/projects/<uuid> 会为每个 uuid 生成一条序列，很快压垮 Prometheus。
 */
import { Router } from "express";
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

import type { NextFunction, Request, RequestHandler, Response } from "express";

/** 未匹配到任何路由时的标签值：防止扫描器用随机路径撑爆指标基数。 */
const UNMATCHED_ROUTE = "unmatched";

/** 覆盖从快接口到大文件合并的响应时间分布，单位秒。 */
const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * 路由模板标签。
 *
 * 这里不拼接 req.baseUrl：Express 在 router 执行结束后会还原 baseUrl，
 * 到 res 的 finish 事件时它已经是空字符串，拼上去只会得到误导性的结果。
 * 因此标签是不含挂载前缀的模板（/projects/:projectId），版本信息由单独的 api_version 标签承载。
 */
function routeLabel(req: Request): string {
  const route = req.route as { path?: unknown } | undefined;
  const path = route && typeof route === "object" && typeof route.path === "string" ? route.path : undefined;
  return path ?? UNMATCHED_ROUTE;
}

/**
 * 请求命中的 API 版本前缀，取值固定为 v1 / legacy / none，基数有界。
 * 业务路由同时挂在 /api/v1 与兼容别名 /api 上，这个标签用来观察存量客户端的迁移进度——
 * legacy series 归零就意味着别名可以下线了。
 */
function apiVersionLabel(req: Request): string {
  const url = req.originalUrl;
  if (url.startsWith("/api/v1/") || url === "/api/v1") return "v1";
  if (url.startsWith("/api/")) return "legacy";
  return "none";
}

export function createMetrics() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const requestsTotal = new Counter({
    name: "http_requests_total",
    help: "HTTP 请求总数",
    labelNames: ["method", "route", "status_code", "api_version"] as const,
    registers: [registry],
  });

  const requestDuration = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP 请求耗时分布（秒）",
    labelNames: ["method", "route", "status_code", "api_version"] as const,
    buckets: DURATION_BUCKETS,
    registers: [registry],
  });

  const middleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
      const labels = {
        method: req.method,
        // route 必须在 finish 时读取：Express 要匹配完路由后才会填充 req.route。
        route: routeLabel(req),
        status_code: String(res.statusCode),
        api_version: apiVersionLabel(req),
      };
      requestsTotal.inc(labels);
      requestDuration.observe(labels, Number(process.hrtime.bigint() - startedAt) / 1e9);
    });
    next();
  };

  const routes = Router();
  routes.get("/metrics", (_req, res) => {
    void (async () => {
      res.set("Content-Type", registry.contentType);
      res.send(await registry.metrics());
    })();
  });

  return { registry, middleware, routes };
}

export type AppMetrics = ReturnType<typeof createMetrics>;
