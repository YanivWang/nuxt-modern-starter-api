import { redis } from "../redis.js";

const JWT_BLACKLIST_KEY_PREFIX = "jwt:blacklist:";

function getJwtBlackListKey(jti: string) {
  return `${JWT_BLACKLIST_KEY_PREFIX}${jti}`;
}

/**
 * 把一个 JWT 的 jti 加入黑名单
 * ttlSeconds 表示 Redis 自动删除这个黑名单记录的时间
 * 若 ttlSeconds <= 0，则不添加到黑名单
 */
export async function blacklistJwt(jti: string, ttlSeconds: number) {
  if (ttlSeconds <= 0) return;

  // key value options
  await redis.set(getJwtBlackListKey(jti), "1", { EX: ttlSeconds });
}

/**
 * 判断某个JWT的jti是否已经在黑名单中
 */
export async function isJwtBlacklisted(jti: string) {
  const exists = await redis.exists(getJwtBlackListKey(jti));
  return exists === 1;
}
