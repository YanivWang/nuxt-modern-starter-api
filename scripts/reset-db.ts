/**
 * 文件职责：开发/测试用数据库重建脚本。
 * 会 drop 当前数据库中的表并重新执行迁移，禁止用于生产环境。
 */
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
