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
if (tp === "1" || tp?.toLowerCase() === "true") {
  app.set("trust proxy", 1);
} else if (tp && /^\d+$/.test(tp)) {
  app.set("trust proxy", Number(tp));
}

const defaultHelmet = helmet();
const swaggerHelmet = helmet({ contentSecurityPolicy: false });
const helmetPick: RequestHandler = (req, res, next) => {
  if (req.path.startsWith("/api-docs")) return swaggerHelmet(req, res, next);
  return defaultHelmet(req, res, next);
};
app.use(helmetPick);

app.use(cors({ origin: getCorsOriginOption(), credentials: true }));
app.use(requestIdMiddleware);
app.use(httpRequestLogMiddleware);
app.use("/uploads", express.static(uploadsRoot));
app.use(healthRoutes);
app.use(globalRateLimitMiddleware);
app.use(compressionMiddleware);
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: REQUEST_BODY_LIMIT }));
setupSwagger(app);

app.use("/api", authRoutes);
app.use("/api", userRoutes);
app.use("/api", uploadRoutes);

app.use((_req, _res, next) => {
  next(createHttpError(404, "接口不存在"));
});

app.use(errorMiddleware);

export default app;
