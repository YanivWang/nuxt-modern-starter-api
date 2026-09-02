/** 文件职责：创建纯 Express 应用，只装配注入的路由和横切能力。 */
import cors from "cors";
import express, { type RequestHandler, type Router } from "express";
import helmet from "helmet";

import { REQUEST_BODY_LIMIT, TRUST_PROXY, getCorsOriginOption } from "./env.js";
import { compressionMiddleware } from "./middlewares/compression.middleware.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { httpRequestLogMiddleware } from "./middlewares/httpRequestLog.middleware.js";
import { requestIdMiddleware } from "./middlewares/requestId.middleware.js";
import { notFound } from "./shared/errors/app-error.js";
import { setupSwagger } from "./swagger.js";

import type { FileStorage } from "./modules/upload/index.js";

/**
 * 当前 API 版本前缀，业务接口的唯一入口。
 *
 * 曾经并行挂载过无版本别名 /api 供存量客户端过渡，现已下线：
 * 同一实现挂两个前缀会让「哪条路径是契约」变得含糊，OpenAPI 文档、
 * 集成测试与前端 adapter 也要各自维护两套说法。破坏性变更改为只通过
 * 抬版本号（/api/v2）发布。
 */
export const API_VERSION_PREFIX = "/api/v1";

export type AppDependencies = {
  healthRoutes: Router;
  metricsRoutes: Router;
  apiRoutes: Router[];
  fileStorage: FileStorage;
  globalRateLimit: RequestHandler;
  staticRateLimit: RequestHandler;
  metricsMiddleware: RequestHandler;
};

export function createApp({
  healthRoutes,
  metricsRoutes,
  apiRoutes,
  fileStorage,
  globalRateLimit,
  staticRateLimit,
  metricsMiddleware,
}: AppDependencies) {
  const app = express();
  const trustProxy = TRUST_PROXY;
  if (trustProxy === "1" || trustProxy?.toLowerCase() === "true") app.set("trust proxy", 1);
  else if (trustProxy && /^\d+$/.test(trustProxy)) app.set("trust proxy", Number(trustProxy));

  const defaultHelmet = helmet();
  const swaggerHelmet = helmet({ contentSecurityPolicy: false });
  const uploadsHelmet = helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } });
  const securityHeaders: RequestHandler = (req, res, next) => {
    if (req.path.startsWith("/api-docs")) return swaggerHelmet(req, res, next);
    if (req.path.startsWith("/uploads")) return uploadsHelmet(req, res, next);
    return defaultHelmet(req, res, next);
  };

  app.use(securityHeaders);
  app.use(cors({ origin: getCorsOriginOption(), credentials: true }));
  app.use(requestIdMiddleware);
  app.use(metricsMiddleware);
  app.use(httpRequestLogMiddleware);
  // /uploads 是无鉴权的公开静态出口，走独立的限流预算：
  // 记在业务接口账上会让图片多的页面把 API 配额烧光，完全不限则是一条
  // 无需登录、可以无限反复拉大文件的出口。生产环境仍应由 Nginx/CDN 直接提供
  // 并在那一层限带宽，这一档是没有 CDN 时的底线。
  // 前提是这个目录里不能有私有内容——分片、会话、秒传索引一律放 .data/。
  app.use("/uploads", staticRateLimit, express.static(fileStorage.root));
  app.use(healthRoutes);
  // /metrics 不参与限流，也不应经公网网关暴露：由集群内 Prometheus 直接抓取。
  app.use(metricsRoutes);
  app.use(globalRateLimit);
  app.use(compressionMiddleware);
  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: REQUEST_BODY_LIMIT }));
  setupSwagger(app);
  for (const routes of apiRoutes) {
    app.use(API_VERSION_PREFIX, routes);
  }
  app.use((_req, _res, next) => next(notFound("接口不存在")));
  app.use(errorMiddleware);
  return app;
}
