/** 文件职责：创建带测试库名称硬保护的集成测试 Runtime，并提供 Redis 状态清理。 */
import { APP_ENV, DB_NAME, REDIS_URL } from "../../../src/env.js";
import { createRuntime } from "../../../src/runtime.js";

import type { AppRuntime } from "../../../src/runtime.js";

export function createTestRuntime() {
  if (APP_ENV !== "test" || !/(^|[_-])test($|[_-])/i.test(DB_NAME)) {
    throw new Error(`拒绝运行集成测试：APP_ENV 必须为 test，且 DB_NAME 必须明确包含 test（当前 ${DB_NAME}）`);
  }
  return createRuntime();
}

/** 从 redis:// URL 解析逻辑库索引；未指定时 Redis 默认使用 0 号库。 */
function redisDatabaseIndex(url: string): number {
  const path = new URL(url).pathname.replace(/^\//, "");
  return path === "" ? 0 : Number(path);
}

/**
 * 清空测试用 Redis 逻辑库。
 *
 * 限流计数、登录失败计数与 JWT 黑名单都存在 Redis 里且带 TTL，不会随用例结束消失。
 * 不清理的话，连续跑两次集成测试就会因为 429 大面积变红——CI 上重跑一次即假红。
 *
 * 硬保护：只允许清非 0 号库。0 号库是开发环境默认使用的库，
 * 一旦 .env.test 的 REDIS_URL 被改回不带索引的形式，这里必须直接报错而不是把开发数据清掉。
 */
export async function resetRedisState(runtime: AppRuntime) {
  if (!REDIS_URL) return;

  const index = redisDatabaseIndex(REDIS_URL);
  if (!Number.isInteger(index) || index <= 0) {
    throw new Error(
      `拒绝清理 Redis：集成测试必须使用非 0 号逻辑库（当前 REDIS_URL 解析出 ${index}）。` +
        "请在 .env.test 的 REDIS_URL 末尾加上 /1。",
    );
  }

  await runtime.redis.connect();
  await runtime.redis.client?.flushDb();
}
