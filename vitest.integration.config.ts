/**
 * 文件职责：Vitest 集成测试配置。
 * 只运行 tests/integration 下依赖 MySQL/Redis 的 API 集成测试。
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    fileParallelism: false,
  },
});
