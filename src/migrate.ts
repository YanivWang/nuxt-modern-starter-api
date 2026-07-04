/**
 * 文件职责：命令行迁移入口。
 * 支持 up/down/pending/executed，执行结束后主动关闭 Sequelize 连接。
 */
import { sequelize } from "./db.js";
import { migrator } from "./migrator.js";
import { logger, serializeError } from "./utils/logger.js";

type MigrationCommand = "up" | "down" | "pending" | "executed";

const rawCommand = process.argv[2] ?? "up";
const command = rawCommand as MigrationCommand;

async function main() {
  if (command === "up") {
    await migrator.up();
    logger.info("migration_up_completed");
    return;
  }

  if (command === "down") {
    await migrator.down();
    logger.info("migration_down_completed");
    return;
  }

  if (command === "pending") {
    const pending = await migrator.pending();
    console.log(pending.map((migration) => migration.name).join("\n"));
    return;
  }

  if (command === "executed") {
    const executed = await migrator.executed();
    console.log(executed.map((migration) => migration.name).join("\n"));
    return;
  }

  throw new Error(`未知迁移命令: ${rawCommand}`);
}

main()
  .catch((error) => {
    logger.error("migration_command_failed", { command, error: serializeError(error) });
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => {});
  });
