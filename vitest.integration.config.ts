/**
 * 文件职责：Vitest 集成测试配置。
 * 只运行 tests/integration 下依赖 MySQL/Redis 的 API 集成测试。
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    // 集成测试要走真实 MySQL/Redis 与 bcrypt，默认 5s 不足以覆盖多次注册登录的用例。
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
