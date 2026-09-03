/**
 * 文件职责：开发/测试用数据库重建脚本。
 * 会 drop 当前数据库中的表并重新执行迁移，禁止用于生产环境。
 *
 * 「禁止」必须由代码强制，不能只写在注释里：这个脚本做的是不可逆的删库，
 * 而它读的是与服务同一套 env —— 在生产机上、或者 shell 里恰好导出了生产配置时
 * 敲一次 pnpm db:drop-create，数据就没了，没有任何东西会拦。
 * db/index.ts 早就按 APP_ENV 区分过「自动追迁移」，这里沿用同一个判据。
 *
 * 不提供 --force 之类的绕过开关：给不可逆操作留后门，正是事故发生的方式。
 * 生产上确需重建时应当由人手动执行，并且清楚自己在做什么。
 */
import { database } from "../src/db/index.js";
import { migrator } from "../src/db/migrator.js";
import { APP_ENV } from "../src/env.js";

async function main() {
  if (APP_ENV === "production") {
    console.error("[reset-db] 拒绝在生产环境执行：该脚本会 drop 所有表。");
    console.error(`[reset-db] 当前 APP_ENV=${APP_ENV}，如需重建请手动操作。`);
    process.exitCode = 1;
    return;
  }

  await database.sequelize.drop();
  await migrator.up();
  console.log(`数据库已通过迁移重建（APP_ENV=${APP_ENV}）`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await database.disconnect().catch(() => {});
  });
