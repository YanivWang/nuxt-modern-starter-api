/** 文件职责：唯一组合根，选择基础设施 Adapter、组装业务模块并管理依赖生命周期。 */
import { createApp } from "./app.js";
import { database } from "./db/index.js";
import { NUXT_REVALIDATE_URL, REVALIDATE_SECRET } from "./env.js";
import { createRedisTokenBlacklist } from "./infrastructure/auth/redis-token-blacklist.js";
import { createInMemoryContentRepository } from "./infrastructure/content/in-memory-content.repository.js";
import { createNuxtContentRevalidator } from "./infrastructure/revalidation/nuxt-content-revalidator.js";
import { localFileStorage } from "./infrastructure/storage/local-file-storage.adapter.js";
import { localLargeUploadStorage } from "./infrastructure/storage/local-large-upload.adapter.js";
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
  const auth = createAuthModule(database, blacklist);
  const content = createContentModule(
    createInMemoryContentRepository(),
    createNuxtContentRevalidator({ url: NUXT_REVALIDATE_URL, secret: REVALIDATE_SECRET }),
    auth.authMiddleware,
  );
  const user = createUserModule(database, auth.authMiddleware);
  const workspace = createWorkspaceModule(database, auth.authMiddleware);
  const document = createDocumentModule(database, auth.authMiddleware);
  const uploadRoutes = createUploadRoutes(auth.authMiddleware, localFileStorage, localLargeUploadStorage);
  const app = createApp({
    healthRoutes: createHealthRoutes(database, redisConnection),
    apiRoutes: [auth.routes, content.routes, user.routes, workspace.routes, document.routes, uploadRoutes],
    fileStorage: localFileStorage,
  });

  return {
    app,
    database,
    redis: redisConnection,
    async connect() {
      await database.connect();
      await redisConnection.connect();
      localFileStorage.ensureRoot();
    },
    async disconnect() {
      await Promise.allSettled([database.disconnect(), redisConnection.disconnect()]);
    },
  };
}

export type AppRuntime = ReturnType<typeof createRuntime>;
