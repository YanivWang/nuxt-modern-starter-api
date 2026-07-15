/**
 * 文件职责：Vitest 单元测试配置。
 * 只运行 tests/unit 下不依赖 MySQL/Redis 的单元测试。
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
