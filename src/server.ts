/** 文件职责：进程入口，负责监听端口、信号处理和优雅退出。 */
import { APP_ENV, PORT } from "./env.js";
import { createRuntime } from "./runtime.js";
import { logger, serializeError } from "./utils/logger.js";

const runtime = createRuntime();
await runtime.connect();

const server = runtime.app.listen(PORT, () => {
  logger.info("server_started", { url: `http://localhost:${PORT}`, appEnv: APP_ENV });
});

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
