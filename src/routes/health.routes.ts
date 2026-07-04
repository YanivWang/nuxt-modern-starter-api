import { Router } from "express";

import { sequelize } from "../db.js";
import { redis } from "../redis.js";

const router = Router();

/** 存活探针：不访问数据库 */
router.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

/** 就绪探针：校验 MySQL 与 Redis；失败返回 503 并标明各项检查结果 */
router.get("/ready", async (_req, res) => {
  const checks: { mysql: "ok" | "failed"; redis: "ok" | "failed" } = {
    mysql: "failed",
    redis: "failed",
  };

  try {
    await sequelize.authenticate(); //检查mysql是否连接成功
    checks.mysql = "ok";
  } catch {
    checks.mysql = "failed";
  }

  try {
    await redis.ping(); //检查redis是否连接成功
    checks.redis = "ok";
  } catch {
    checks.redis = "failed";
  }

  const ready = checks.mysql === "ok" && checks.redis === "ok";
  if (ready) {
    res.status(200).json({ status: "ready", checks });
    return;
  }

  const failed = (["mysql", "redis"] as const).filter((k) => checks[k] === "failed");
  res.status(503).json({
    status: "not_ready",
    checks,
    message: `依赖不可用：${failed.join("、")}`,
  });
});

export default router;
