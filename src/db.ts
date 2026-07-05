/**
 * 文件职责：创建 Sequelize 连接并注册业务模型。
 * 开发/测试环境会在连接成功后自动执行待处理迁移；生产环境只验证连接，迁移需显式执行。
 */
import { Sequelize } from "sequelize";

import { APP_ENV, DB_HOST, DB_NAME, DB_PORT, DB_PWD, DB_USER } from "./env.js";
import { initModels } from "./models/index.js";
import { logger } from "./utils/logger.js";

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PWD, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: "mysql",
  logging: APP_ENV === "test" ? false : undefined,
});

const { User, UserProfile, UserRefreshToken, Workspace, Project, Document } = initModels(sequelize);

export async function connectDatabase() {
  await sequelize.authenticate();
  if (APP_ENV !== "production") {
    // 开发/测试环境自动追迁移，降低本地启动成本；生产环境必须显式执行迁移，避免启动时改表。
    const { runPendingMigrations } = await import("./migrator.js");
    await runPendingMigrations();
    logger.info("database_migrations_applied", { appEnv: APP_ENV });
  }
}

export { sequelize, User, UserProfile, UserRefreshToken, Workspace, Project, Document };
