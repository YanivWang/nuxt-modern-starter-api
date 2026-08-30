/** 文件职责：进程入口，负责监听端口、信号处理和优雅退出。 */
import { APP_ENV, PORT } from "./env.js";
import { createRuntime } from "./runtime.js";
import { logger, serializeError } from "./utils/logger.js";

// 进程级兜底：任何逃逸到顶层的异常都必须先落日志，再决定进程去留。
// Node 20+ 默认把未处理的 Promise rejection 视为致命错误，若不接管则连崩溃原因都不会被记录。
process.on("unhandledRejection", (reason) => {
  logger.error("unhandled_rejection", { error: serializeError(reason) });
});

process.on("uncaughtException", (error) => {
  // 未捕获异常之后进程状态已不可信，记录后走优雅退出，由编排平台重新拉起。
  logger.error("uncaught_exception", { error: serializeError(error) });
  void shutdown("SIGTERM");
});

const runtime = createRuntime();
await runtime.connect();

const server = runtime.app.listen(PORT, () => {
  logger.info("server_started", { url: `http://localhost:${PORT}`, appEnv: APP_ENV });
});

// 后台清理只在真实进程里启动；测试通过 createRuntime() 拿到 app 时不应带上定时任务。
runtime.cleanup.start();

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    logger.error("server_port_in_use", { port: PORT, error: serializeError(error) });
    process.exit(1);
  }
  throw error;
});

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("server_shutdown_started", { signal });
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  try {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await runtime.disconnect();
    logger.info("server_shutdown_completed", { signal });
    process.exit(0);
  } catch (error) {
    logger.error("server_shutdown_failed", { signal, error: serializeError(error) });
    process.exit(1);
  }
}

process.once("SIGTERM", (signal) => void shutdown(signal));
process.once("SIGINT", (signal) => void shutdown(signal));
