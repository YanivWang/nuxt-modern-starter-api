/**
 * 文件职责：管理可选 Redis 客户端生命周期。
 * 当前 Redis 只服务于 JWT 黑名单；关闭 AUTH_TOKEN_BLACKLIST_ENABLED 时本文件导出空客户端并跳过连接。
 */
import { createClient } from "redis";

import { AUTH_TOKEN_BLACKLIST_ENABLED, REDIS_URL } from "./env.js";
import { logger, serializeError } from "./utils/logger.js";

// Redis 在当前脚手架里不是通用缓存层，只用于登出后 JWT jti 黑名单。
export const redis = AUTH_TOKEN_BLACKLIST_ENABLED ? createClient({ url: REDIS_URL }) : null;

redis?.on("error", (err) => {
  logger.error("redis_client_error", { error: serializeError(err) });
});

export async function connectRedis() {
  if (!redis) {
    // 关闭黑名单意味着已签发 access token 只能等自然过期，/ready 会把 Redis 标记为 disabled。
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
