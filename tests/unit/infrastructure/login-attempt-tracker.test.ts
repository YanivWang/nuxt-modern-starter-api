/**
 * 文件职责：钉住登录失败计数器与 Redis 的交互方式。
 *
 * 这里唯一值得测的是「INCR 和 EXPIRE 有没有在同一个 MULTI 里提交」。
 * 拆成两条命令时功能完全正常，只有在进程恰好死在两条命令之间时才会出问题——
 * 那个 key 从此没有 TTL，对应用户名被永久锁死。
 * 这种缺陷不会被任何功能测试发现，只能直接断言命令的组织方式。
 */
import { describe, expect, it, vi } from "vitest";

import { createRedisLoginAttemptTracker } from "../../../src/infrastructure/auth/redis-login-attempt-tracker.js";

import type { RedisConnection } from "../../../src/redis.js";

function fakeRedis() {
  const calls: string[] = [];
  const multi = {
    incr: vi.fn((key: string) => {
      calls.push(`incr ${key}`);
      return multi;
    }),
    expire: vi.fn((key: string, seconds: number) => {
      calls.push(`expire ${key} ${seconds}`);
      return multi;
    }),
    exec: vi.fn(() => {
      calls.push("exec");
      return Promise.resolve([3, 1]);
    }),
  };

  const client = {
    multi: vi.fn(() => multi),
    incr: vi.fn(() => Promise.resolve(1)),
    expire: vi.fn(() => Promise.resolve(true)),
    get: vi.fn(() => Promise.resolve<string | null>(null)),
    del: vi.fn(() => Promise.resolve(1)),
  };

  return { calls, multi, client };
}

const asConnection = (client: unknown): RedisConnection => ({ client }) as unknown as RedisConnection;

describe("redis login attempt tracker", () => {
  it("submits INCR and EXPIRE in a single MULTI so the counter can never lose its TTL", async () => {
    const { calls, client } = fakeRedis();
    const tracker = createRedisLoginAttemptTracker(asConnection(client));

    const failures = await tracker.recordFailure("Alice");

    expect(client.multi).toHaveBeenCalledOnce();
    expect(calls).toEqual(["incr login:failed:alice", "expire login:failed:alice 900", "exec"]);
    // 一条命令都不能走在事务之外
    expect(client.incr).not.toHaveBeenCalled();
    expect(client.expire).not.toHaveBeenCalled();
    // 返回值取 INCR 的回复，调用方据此判断是否已达锁定阈值
    expect(failures).toBe(3);
  });

  it("normalises the username so case variants share one counter", async () => {
    const { calls, client } = fakeRedis();
    const tracker = createRedisLoginAttemptTracker(asConnection(client));

    await tracker.recordFailure("  ALICE  ");
    await tracker.reset("Alice");

    expect(calls[0]).toBe("incr login:failed:alice");
    expect(client.del).toHaveBeenCalledWith("login:failed:alice");
  });

  it("never locks anyone out when redis is not configured", async () => {
    const tracker = createRedisLoginAttemptTracker(asConnection(null));

    expect(await tracker.isLocked("alice")).toBe(false);
    expect(await tracker.recordFailure("alice")).toBe(0);
    await expect(tracker.reset("alice")).resolves.toBeUndefined();
  });
});
