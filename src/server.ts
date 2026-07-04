/**
 * 文件职责：Node 进程入口。
 * 启动顺序为数据库、Redis、上传目录、HTTP 监听，并负责 SIGTERM/SIGINT 下的优雅退出。
 */
import app from "./app.js";
import { ensureUploadsRoot } from "./modules/upload/upload.config.js";
import { connectDatabase, sequelize } from "./db.js";
import { APP_ENV, PORT } from "./env.js";
import { connectRedis, disconnectRedis } from "./redis.js";
import { logger, serializeError } from "./utils/logger.js";

// 进程入口只做基础设施启动：DB/Redis 就绪后再监听端口，避免应用已接流量但依赖不可用。
await connectDatabase();
await connectRedis();

ensureUploadsRoot();

const server = app.listen(PORT, () => {
  logger.info("server_started", { url: `http://localhost:${PORT}`, appEnv: APP_ENV });
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    const hint =
      APP_ENV === "development" ? "已被占用（开发环境可先检查是否尚有旧 nodemon/tsx 未退出）：" : "已被占用：";
    logger.error("server_port_in_use", { port: PORT, error: serializeError(err) });
    console.error(`端口 ${String(PORT)} ${hint}${err.message}`);
    process.exit(1);
  }
  throw err;
});

let shuttingDown = false;

async function closeHttpServer() {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function gracefulShutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info("server_shutdown_started", { signal });

  const forceExit = setTimeout(() => {
    logger.error("server_shutdown_timeout", { signal });
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    // 先停止接收新请求，再释放数据库/Redis 连接；10 秒兜底防止容器停止卡死。
    await closeHttpServer();
    await Promise.allSettled([sequelize.close(), disconnectRedis()]);
    logger.info("server_shutdown_completed", { signal });
    process.exit(0);
  } catch (error) {
    logger.error("server_shutdown_failed", { signal, error: serializeError(error) });
    process.exit(1);
  }
}

process.once("SIGTERM", (signal) => {
  void gracefulShutdown(signal);
});
process.once("SIGINT", (signal) => {
  void gracefulShutdown(signal);
});
