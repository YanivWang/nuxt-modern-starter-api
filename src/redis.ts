/**
 * 文件职责：管理可选 Redis 客户端生命周期。
 * 只要配置了 REDIS_URL 就建立连接：Redis 同时服务于 JWT 黑名单、分布式限流和登录失败计数，
 * 因此它的启用条件是「有没有配地址」，而不是某一个功能开关。
 */
import { createClient } from "redis";

import { AUTH_TOKEN_BLACKLIST_ENABLED, REDIS_URL } from "./env.js";
import { logger, serializeError } from "./utils/logger.js";

const client = REDIS_URL ? createClient({ url: REDIS_URL }) : null;

client?.on("error", (err) => {
  logger.error("redis_client_error", { error: serializeError(err) });
});

// 连接去重：connect() 会被进程启动流程和限流 store 各调用一次，并发调用不能触发两次 connect。
let connecting: Promise<void> | null = null;

/**
 * 建立连接，幂等且可并发调用。
 * 限流 store 在发出每条命令前都会调用它——客户端已就绪时这是一次 isOpen 判断，
 * 未就绪时则负责把连接补上，避免依赖调用方的初始化顺序。
 */
async function connect() {
  if (!client) {
    // 无 Redis 时：已签发 access token 只能等自然过期，限流退化为单实例内存计数，/ready 把 Redis 标记为 disabled。
    logger.warn("redis_disabled", { reason: "REDIS_URL 未配置", blacklistEnabled: AUTH_TOKEN_BLACKLIST_ENABLED });
    return;
  }
  if (client.isOpen) return;

  connecting ??= (async () => {
    await client.connect();
    await client.ping();
    logger.info("redis_connected");
  })().catch((error: unknown) => {
    // 失败的 promise 不能被缓存，否则一次启动期抖动会让后续所有重连都直接复用这个失败结果。
    connecting = null;
    throw error;
  });

  await connecting;
}

async function disconnect() {
  connecting = null;
  if (!client) return;
  if (!client.isOpen) return;

  await client.quit();
}

export const redisConnection = {
  client,
  connect,
  disconnect,
};

export type RedisConnection = typeof redisConnection;
