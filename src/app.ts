/** 文件职责：创建纯 Express 应用，只装配注入的路由和横切能力。 */
import cors from "cors";
import express, { type RequestHandler, type Router } from "express";
import helmet from "helmet";

import { REQUEST_BODY_LIMIT, TRUST_PROXY, getCorsOriginOption } from "./env.js";
import { compressionMiddleware } from "./middlewares/compression.middleware.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { httpRequestLogMiddleware } from "./middlewares/httpRequestLog.middleware.js";
import { globalRateLimitMiddleware } from "./middlewares/rateLimit.middleware.js";
import { requestIdMiddleware } from "./middlewares/requestId.middleware.js";
import { notFound } from "./shared/errors/app-error.js";
import { setupSwagger } from "./swagger.js";

import type { FileStorage } from "./modules/upload/index.js";

export type AppDependencies = {
  healthRoutes: Router;
  apiRoutes: Router[];
  fileStorage: FileStorage;
};

export function createApp({ healthRoutes, apiRoutes, fileStorage }: AppDependencies) {
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
  app.use(httpRequestLogMiddleware);
  app.use("/uploads", express.static(fileStorage.root));
  app.use(healthRoutes);
  app.use(globalRateLimitMiddleware);
  app.use(compressionMiddleware);
  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: REQUEST_BODY_LIMIT }));
  setupSwagger(app);
  for (const routes of apiRoutes) app.use("/api", routes);
  app.use((_req, _res, next) => next(notFound("接口不存在")));
  app.use(errorMiddleware);
  return app;
}
