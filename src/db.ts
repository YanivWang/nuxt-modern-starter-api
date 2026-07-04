import { Sequelize } from "sequelize";

import { APP_ENV, DB_HOST, DB_NAME, DB_PORT, DB_PWD, DB_USER } from "./env.js";
import { initModels } from "./models/index.js";

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PWD, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: "mysql",
});

const { User, UserProfile } = initModels(sequelize);

export async function connectDatabase() {
  await sequelize.authenticate();
  if (APP_ENV === "development") {
    const alter = process.env.DB_SYNC_ALTER !== "0";
    await sequelize.sync(alter ? { alter: true } : {});
  } else {
    await sequelize.sync();
  }
}

export { sequelize, User, UserProfile };
