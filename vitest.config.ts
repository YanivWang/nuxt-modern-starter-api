/**
 * 文件职责：Vitest 单元测试配置。
 * 默认只包含 src 下的 .test.ts 文件，不运行依赖 MySQL/Redis 的 integration 测试。
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
