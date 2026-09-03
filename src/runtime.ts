/** 文件职责：唯一组合根，选择基础设施 Adapter、组装业务模块并管理依赖生命周期。 */
import { createApp } from "./app.js";
import { database } from "./db/index.js";
import { NUXT_REVALIDATE_URL, REVALIDATE_SECRET } from "./env.js";
import { createRedisLoginAttemptTracker } from "./infrastructure/auth/redis-login-attempt-tracker.js";
import { createRedisTokenBlacklist } from "./infrastructure/auth/redis-token-blacklist.js";
import { createSequelizeContentRepository } from "./infrastructure/content/sequelize-content.repository.js";
import { createCleanupScheduler } from "./infrastructure/maintenance/cleanup.scheduler.js";
import { createMetrics } from "./infrastructure/observability/metrics.js";
import { createRedisRateLimitStore } from "./infrastructure/rate-limit/redis-rate-limit.store.js";
import { createNuxtContentRevalidator } from "./infrastructure/revalidation/nuxt-content-revalidator.js";
import { localFileStorage } from "./infrastructure/storage/local-file-storage.adapter.js";
import { localLargeUploadStorage } from "./infrastructure/storage/local-large-upload.adapter.js";
import {
  createAuthRateLimitMiddleware,
  createGlobalRateLimitMiddleware,
  createStaticRateLimitMiddleware,
} from "./middlewares/rateLimit.middleware.js";
import { createRequireRole } from "./middlewares/requireRole.middleware.js";
import { createAuthModule } from "./modules/auth/index.js";
import { createContentModule } from "./modules/content/index.js";
import { createDocumentModule } from "./modules/document/index.js";
import { createUploadRoutes } from "./modules/upload/index.js";
import { createUserModule } from "./modules/user/index.js";
import { createWorkspaceModule } from "./modules/workspace/index.js";
import { redisConnection } from "./redis.js";
import { createHealthRoutes } from "./routes/health.routes.js";

export function createRuntime() {
  const blacklist = createRedisTokenBlacklist(redisConnection);
  const loginAttempts = createRedisLoginAttemptTracker(redisConnection);
  // 限流计数走 Redis：内存 store 在多实例下会让实际阈值变成配置值 × 实例数。
  const globalRateLimit = createGlobalRateLimitMiddleware(createRedisRateLimitStore(redisConnection, "global"));
  const authRateLimit = createAuthRateLimitMiddleware(createRedisRateLimitStore(redisConnection, "auth"));
  const staticRateLimit = createStaticRateLimitMiddleware(createRedisRateLimitStore(redisConnection, "static"));
  const metrics = createMetrics();

  const auth = createAuthModule(database, blacklist, loginAttempts, authRateLimit);
  const user = createUserModule(database, auth.authMiddleware);
  // 角色的权威来源是 Users 表，由用户模块提供查询；授权中间件在组合根装配，
  // 内容模块只拿到一个已经装好的守卫，不需要知道角色存在哪里。
  const requireAdmin = createRequireRole(user.findRole)("admin");
  const content = createContentModule(
    createSequelizeContentRepository(database.models.NewsArticle),
    createNuxtContentRevalidator({ url: NUXT_REVALIDATE_URL, secret: REVALIDATE_SECRET }),
    auth.authMiddleware,
    requireAdmin,
  );
  const workspace = createWorkspaceModule(database, auth.authMiddleware);
  const document = createDocumentModule(database, auth.authMiddleware);
  const uploadRoutes = createUploadRoutes(auth.authMiddleware, localFileStorage, localLargeUploadStorage);

  const cleanup = createCleanupScheduler({
    purgeExpiredSessions: auth.sessions.purgeExpired,
    largeUploads: localLargeUploadStorage,
  });

  const app = createApp({
    healthRoutes: createHealthRoutes(database, redisConnection),
    metricsRoutes: metrics.routes,
    apiRoutes: [auth.routes, content.routes, user.routes, workspace.routes, document.routes, uploadRoutes],
    fileStorage: localFileStorage,
    globalRateLimit,
    staticRateLimit,
    metricsMiddleware: metrics.middleware,
  });

  return {
    app,
    database,
    redis: redisConnection,
    metrics,
    cleanup,
    async connect() {
      await database.connect();
      await redisConnection.connect();
      localFileStorage.ensureRoot();
    },
    async disconnect() {
      cleanup.stop();
      await Promise.allSettled([database.disconnect(), redisConnection.disconnect()]);
    },
  };
}

export type AppRuntime = ReturnType<typeof createRuntime>;
