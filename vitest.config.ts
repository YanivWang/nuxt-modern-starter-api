/**
 * 文件职责：Vitest 单元测试配置。
 * 只运行 tests/unit 下不依赖 MySQL/Redis 的单元测试，并对纯逻辑模块设置覆盖率下限。
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      reportsDirectory: "coverage",
      // 只统计单元测试真正应当覆盖的纯逻辑：路由装配、模型定义、组合根等
      // 由集成测试保证，把它们计入分母会让阈值失去指导意义。
      include: [
        "src/shared/**/*.ts",
        "src/utils/**/*.ts",
        "src/modules/**/*.service.ts",
        "src/modules/auth/authCookie.ts",
        "src/infrastructure/storage/large-upload.internals.ts",
        "src/infrastructure/revalidation/**/*.ts",
      ],
      // logger.ts 是 winston transport 装配，在 import 期执行，对它做覆盖率要求只会催生无意义的测试。
      exclude: ["src/utils/logger.ts"],
      // 阈值取当前实测值下方一档：既能挡住回退，也便于随测试补充逐步上调。
      thresholds: {
        statements: 75,
        branches: 85,
        functions: 70,
        lines: 75,
      },
    },
  },
});
