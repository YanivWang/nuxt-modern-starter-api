import path from "node:path";
import { fileURLToPath } from "node:url";

/** 独立后端仓库根目录。 */
export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
