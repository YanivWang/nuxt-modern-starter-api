/**
 * 文件职责：开发/测试用数据库重建脚本。
 * 会 drop 当前数据库中的表并重新执行迁移，禁止用于生产环境。
 */
import { database } from "../src/db/index.js";
import { migrator } from "../src/db/migrator.js";

async function main() {
  await database.sequelize.drop();
  await migrator.up();
  console.log("数据库已通过迁移重建");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await database.disconnect().catch(() => {});
  });
