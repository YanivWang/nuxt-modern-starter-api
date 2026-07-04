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

const { User, UserProfile, UserRefreshToken } = initModels(sequelize);

export async function connectDatabase() {
  await sequelize.authenticate();
  if (APP_ENV !== "production") {
    const { runPendingMigrations } = await import("./migrator.js");
    await runPendingMigrations();
    logger.info("database_migrations_applied", { appEnv: APP_ENV });
  }
}

export { sequelize, User, UserProfile, UserRefreshToken };
