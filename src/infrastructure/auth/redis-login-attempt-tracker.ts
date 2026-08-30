/**
 * 文件职责：用 Redis 实现登录失败计数与账号锁定的 LoginAttemptTracker Port。
 * 无 Redis 时降级为「从不锁定」的空实现，保证服务仍可运行，但会记录一次告警。
 */
import { LOGIN_LOCKOUT_SECONDS, LOGIN_MAX_FAILED_ATTEMPTS } from "../../env.js";
import { logger } from "../../utils/logger.js";

import type { LoginAttemptTracker } from "../../modules/auth/ports/login-attempt-tracker.port.js";
import type { RedisConnection } from "../../redis.js";

const KEY_PREFIX = "login:failed:";

/** 用户名统一小写并截断，避免大小写变体绕过计数、超长用户名撑大 key。 */
const counterKey = (username: string) => `${KEY_PREFIX}${username.trim().toLowerCase().slice(0, 100)}`;

export function createRedisLoginAttemptTracker(connection: RedisConnection): LoginAttemptTracker {
  const { client } = connection;

  if (!client) {
    logger.warn("login_attempt_tracker_disabled", {
      reason: "REDIS_URL 未配置，账号级登录失败锁定不可用，仅剩基于 IP 的限流",
    });
    return {
      isLocked: () => Promise.resolve(false),
      recordFailure: () => Promise.resolve(0),
      reset: () => Promise.resolve(),
    };
  }

  return {
    async isLocked(username) {
      const raw = await client.get(counterKey(username));
      return raw !== null && Number(raw) >= LOGIN_MAX_FAILED_ATTEMPTS;
    },
    async recordFailure(username) {
      const key = counterKey(username);
      const count = await client.incr(key);
      // 每次失败都重置 TTL：持续攻击会持续延长锁定，而不是攻击者熬过固定窗口就重新开始。
      await client.expire(key, LOGIN_LOCKOUT_SECONDS);
      return count;
    },
    async reset(username) {
      await client.del(counterKey(username));
    },
  };
}
