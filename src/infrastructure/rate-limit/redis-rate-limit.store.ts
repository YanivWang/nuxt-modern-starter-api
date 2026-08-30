/**
 * 文件职责：为 express-rate-limit 提供基于 Redis 的共享计数存储。
 * 默认的内存 store 每个进程各算各的：N 个实例部署时实际放行量会变成配置值的 N 倍，
 * 限流在水平扩容后形同虚设。共享 store 让阈值在整个集群内保持一致。
 */
import { RedisStore } from "rate-limit-redis";

import { logger } from "../../utils/logger.js";

import type { RedisConnection } from "../../redis.js";
import type { Store } from "express-rate-limit";

const KEY_PREFIX = "ratelimit:";

export function createRedisRateLimitStore(connection: RedisConnection, scope: string): Store | undefined {
  const { client } = connection;
  if (!client) {
    logger.warn("rate_limit_store_fallback", {
      scope,
      reason: "REDIS_URL 未配置，限流退化为单进程内存计数，多实例部署下阈值不准确",
    });
    return undefined;
  }

  return new RedisStore({
    prefix: `${KEY_PREFIX}${scope}:`,
    sendCommand: async (...args: string[]) => {
      // rate-limit-redis 在中间件构造时就会发出 SCRIPT LOAD，而组合根构造中间件的时机
      // 早于 runtime.connect()。这里先确保连接就绪，使 store 不依赖外部的初始化顺序。
      await connection.connect();
      return client.sendCommand(args);
    },
  });
}
