/** 文件职责：用 Redis 实现认证模块的 TokenBlacklist Port。 */
import type { TokenBlacklist } from "../../modules/auth/ports/token-blacklist.port.js";
import type { RedisConnection } from "../../redis.js";

const KEY_PREFIX = "jwt:blacklist:";

export function createRedisTokenBlacklist(connection: RedisConnection): TokenBlacklist {
  return {
    async add(jti, ttlSeconds) {
      if (!connection.client || ttlSeconds <= 0) return;
      await connection.client.set(`${KEY_PREFIX}${jti}`, "1", { EX: ttlSeconds });
    },
    async has(jti) {
      if (!connection.client) return false;
      return (await connection.client.exists(`${KEY_PREFIX}${jti}`)) === 1;
    },
  };
}
