/** 文件职责：创建注入数据库和 Redis 连接的存活/就绪探针路由。 */
import { Router } from "express";

import type { AppDatabase } from "../db/index.js";
import type { RedisConnection } from "../redis.js";

export function createHealthRoutes(database: AppDatabase, redis: RedisConnection) {
  const router = Router();

  router.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
  router.get("/ready", async (_req, res) => {
    const checks: { mysql: "ok" | "failed"; redis: "ok" | "failed" | "disabled" } = {
      mysql: "failed",
      redis: redis.client ? "failed" : "disabled",
    };
    try {
      await database.sequelize.authenticate();
      checks.mysql = "ok";
    } catch {
      checks.mysql = "failed";
    }
    if (redis.client) {
      try {
        await redis.client.ping();
        checks.redis = "ok";
      } catch {
        checks.redis = "failed";
      }
    }
    const ready = checks.mysql === "ok" && checks.redis !== "failed";
    return res.status(ready ? 200 : 503).json(
      ready
        ? { status: "ready", checks }
        : {
            status: "not_ready",
            checks,
            message: `依赖不可用：${(["mysql", "redis"] as const).filter((key) => checks[key] === "failed").join("、")}`,
          },
    );
  });

  return router;
}
