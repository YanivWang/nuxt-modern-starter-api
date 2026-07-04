/**
 * 文件职责：在测试命令中单独验证环境变量配置。
 * 只需 import src/env.ts，若配置不合法会在导入阶段退出或抛错。
 */
import "../src/env.js";

console.log("环境变量校验通过");
