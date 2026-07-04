import { createClient } from "redis";

import { REDIS_URL } from "./env.js";
import { logger, serializeError } from "./utils/logger.js";

export const redis = createClient({ url: REDIS_URL });

redis.on("error", (err) => {
  logger.error("redis_client_error", { error: serializeError(err) });
});

export async function connectRedis() {
  if (redis.isOpen) return;

  await redis.connect();
  await redis.ping();

  logger.info("redis_connected");
}

export async function disconnectRedis() {
  if (!redis.isOpen) return;

  await redis.quit();
}
