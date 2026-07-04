import app from "./app.js";
import { ensureUploadsRoot } from "./config/upload.config.js";
import { connectDatabase } from "./db.js";
import { APP_ENV, PORT } from "./env.js";
import { connectRedis } from "./redis.js";

await connectDatabase();
await connectRedis();

ensureUploadsRoot();

const server = app.listen(PORT, () => {
  console.log(`服务运行: http://localhost:${PORT}`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    const hint =
      APP_ENV === "development"
        ? "已被占用（开发环境可先检查是否尚有旧 nodemon/tsx 未退出）："
        : "已被占用：";
    console.error(`端口 ${String(PORT)} ${hint}${err.message}`);
    process.exit(1);
  }
  throw err;
});

/** 仅开发：`nodemon` / Docker dev 热重启时先关掉监听，减轻与旧进程的端口竞争 */
if (APP_ENV === "development") {
  function gracefulHttpShutdown() {
    server.close(() => {
      process.exit(0);
    });
    const t = setTimeout(() => process.exit(0), 8_000);
    t.unref();
  }

  process.once("SIGTERM", gracefulHttpShutdown);
  process.once("SIGINT", gracefulHttpShutdown);
}
