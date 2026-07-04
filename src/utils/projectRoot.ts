/**
 * 文件职责：计算仓库根目录。
 * ESM 环境没有 __dirname，此处通过 import.meta.url 推导出独立后端项目根路径。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 独立后端仓库根目录。 */
export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
