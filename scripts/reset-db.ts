import { sequelize } from "../src/db.js";
import { migrator } from "../src/migrator.js";
import { disconnectRedis } from "../src/redis.js";

async function main() {
  await sequelize.drop();
  await migrator.up();
  console.log("数据库已通过迁移重建");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectRedis().catch(() => {});
    await sequelize.close().catch(() => {});
  });
