/**
 * 文件职责：配置 Umzug 数据库迁移器。
 * 迁移上下文是 Sequelize QueryInterface，迁移执行记录存放在数据库中。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SequelizeStorage, Umzug } from "umzug";

import { sequelize } from "./db.js";
import { logger } from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const migrator = new Umzug({
  migrations: {
    glob: path.join(__dirname, "migrations/*.{js,ts}"),
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: {
    info: (message) => logger.info("migration_info", { message }),
    warn: (message) => logger.warn("migration_warn", { message }),
    error: (message) => logger.error("migration_error", { message }),
    debug: (message) => logger.debug("migration_debug", { message }),
  },
});

export async function runPendingMigrations() {
  await migrator.up();
}
