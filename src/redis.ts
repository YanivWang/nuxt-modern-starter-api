import { createClient } from "redis";

import { AUTH_TOKEN_BLACKLIST_ENABLED, REDIS_URL } from "./env.js";
import { logger, serializeError } from "./utils/logger.js";

export const redis = AUTH_TOKEN_BLACKLIST_ENABLED ? createClient({ url: REDIS_URL }) : null;

redis?.on("error", (err) => {
  logger.error("redis_client_error", { error: serializeError(err) });
});

export async function connectRedis() {
  if (!redis) {
    logger.warn("redis_disabled", { reason: "AUTH_TOKEN_BLACKLIST_ENABLED=false" });
    return;
  }
  if (redis.isOpen) return;

  await redis.connect();
  await redis.ping();

  logger.info("redis_connected");
}

export async function disconnectRedis() {
  if (!redis) return;
  if (!redis.isOpen) return;

  await redis.quit();
}
