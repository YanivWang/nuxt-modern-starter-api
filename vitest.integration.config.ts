/**
 * 文件职责：Vitest 集成测试配置。
 * 只运行 src 下的 .integration.test.ts 文件，需外部 MySQL/Redis 依赖按 .env.test 可用。
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    fileParallelism: false,
  },
});
