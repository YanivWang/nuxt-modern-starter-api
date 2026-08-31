/**
 * 文件职责：创建带测试库名称硬保护的集成测试 Runtime，提供常驻 HTTP server 与 Redis 状态清理。
 */
import { APP_ENV, DB_NAME, REDIS_URL } from "../../../src/env.js";
import { createRuntime } from "../../../src/runtime.js";

import type { AppRuntime } from "../../../src/runtime.js";
import type { Server } from "node:http";

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

/**
 * 起一个供整个测试文件复用的 HTTP server。
 *
 * 必须显式起 server，并把它（而不是 Express app）交给 supertest：
 * 传 app 时 supertest 会为**每个请求**新建 http.Server + listen(0)，响应后再 close()。
 * 一个集成测试文件下来就是上百个短命 server，CPU 紧张时会出现请求根本没落到 Express 上、
 * 由更底层直接回一个空 404（text/html、content-length 0、且没有 x-request-id ——
 * 而 requestIdMiddleware 挂在最前面，凡是进过应用的响应都必然带这个头）。
 *
 * 表现出来就是「断言拿到一个毫不相关的状态码」这类随机失败：
 * 期望 200 得到 404、期望 409 得到 404、期望 200 得到 400。看着像业务逻辑错乱，
 * 其实是那次请求压根没经过业务逻辑。
 */
export function startTestServer(runtime: AppRuntime): Server {
  return runtime.app.listen(0);
}

/** 关闭常驻 server；必须在断开数据库/Redis 之前调用，避免在途请求打到已关闭的连接池。 */
export function stopTestServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    // supertest 客户端走的是带 keep-alive 的 globalAgent，close() 不会主动断开空闲连接，
    // 不显式关掉的话 afterAll 要一直等到 keepAliveTimeout（默认 5 秒）才返回。
    server.closeAllConnections();
    server.close(() => resolve());
  });
}
