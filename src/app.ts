/**
 * 文件职责：创建并组装 Express 应用实例。
 * 这里集中注册安全头、CORS、请求追踪、限流、压缩、静态上传目录、Swagger、业务路由和统一错误处理。
 */
import cors from "cors";
import express, { type RequestHandler } from "express";
import helmet from "helmet";

import { uploadsRoot } from "./modules/upload/upload.config.js";
import { REQUEST_BODY_LIMIT, TRUST_PROXY, getCorsOriginOption } from "./env.js";
import { compressionMiddleware } from "./middlewares/compression.middleware.js";
import { createHttpError, errorMiddleware } from "./middlewares/error.middleware.js";
import { httpRequestLogMiddleware } from "./middlewares/httpRequestLog.middleware.js";
import { globalRateLimitMiddleware } from "./middlewares/rateLimit.middleware.js";
import { requestIdMiddleware } from "./middlewares/requestId.middleware.js";
import authRoutes from "./modules/auth/auth.routes.js";
import healthRoutes from "./routes/health.routes.js";
import uploadRoutes from "./modules/upload/upload.routes.js";
import userRoutes from "./modules/user/user.routes.js";
import { setupSwagger } from "./swagger.js";

const app = express();

const tp = TRUST_PROXY;
// 部署在 Nginx / 负载均衡后面时，Express 需要信任代理层写入的转发头，
// 否则 req.ip 与 express-rate-limit 的客户端识别都会退化为代理 IP。
if (tp === "1" || tp?.toLowerCase() === "true") {
  app.set("trust proxy", 1);
} else if (tp && /^\d+$/.test(tp)) {
  app.set("trust proxy", Number(tp));
}

const defaultHelmet = helmet();
const swaggerHelmet = helmet({ contentSecurityPolicy: false });
const helmetPick: RequestHandler = (req, res, next) => {
  // Swagger UI 会内联脚本/样式；仅对文档页放宽 CSP，其他接口继续使用默认安全头。
  if (req.path.startsWith("/api-docs")) return swaggerHelmet(req, res, next);
  return defaultHelmet(req, res, next);
};
app.use(helmetPick);

app.use(cors({ origin: getCorsOriginOption(), credentials: true }));
app.use(requestIdMiddleware);
app.use(httpRequestLogMiddleware);
// 上传文件是公开静态资源，放在 /api 之外，也不经过登录态中间件。
app.use("/uploads", express.static(uploadsRoot));
// 探针先于全局限流，避免健康检查被真实流量挤出限流窗口。
app.use(healthRoutes);
app.use(globalRateLimitMiddleware);
app.use(compressionMiddleware);
// body parser 放在上传/探针之后：multipart 交给 multer，探针无需解析请求体。
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: REQUEST_BODY_LIMIT }));
setupSwagger(app);

// 业务 API 统一挂在 /api 下；路由内部决定是否需要 authMiddleware。
app.use("/api", authRoutes);
app.use("/api", userRoutes);
app.use("/api", uploadRoutes);

app.use((_req, _res, next) => {
  next(createHttpError(404, "接口不存在"));
});

app.use(errorMiddleware);

export default app;
