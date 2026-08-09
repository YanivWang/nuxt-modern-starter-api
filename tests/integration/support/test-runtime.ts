/** 文件职责：创建带测试库名称硬保护的集成测试 Runtime。 */
import { APP_ENV, DB_NAME } from "../../../src/env.js";
import { createRuntime } from "../../../src/runtime.js";

export function createTestRuntime() {
  if (APP_ENV !== "test" || !/(^|[_-])test($|[_-])/i.test(DB_NAME)) {
    throw new Error(`拒绝运行集成测试：APP_ENV 必须为 test，且 DB_NAME 必须明确包含 test（当前 ${DB_NAME}）`);
  }
  return createRuntime();
}
