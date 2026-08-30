/** 文件职责：以静态导入规则强制模块、HTTP 和基础设施之间的架构边界。 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(root, "src");
const violations = [];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : entry.isFile() && entry.name.endsWith(".ts") ? [absolute] : [];
  });
}

const moduleName = (file) => {
  const relative = path.relative(path.join(srcRoot, "modules"), file);
  return relative.startsWith("..") ? null : relative.split(path.sep)[0];
};

/**
 * 判断某个 `from "..."` 属于 `import type` 语句。
 * 类型导入在编译后被完全擦除，不产生运行时依赖，因此可以适用比值导入更宽松的边界规则。
 */
function isTypeOnlyImport(source, fromIndex) {
  const importIndex = source.lastIndexOf("import", fromIndex);
  if (importIndex < 0) return false;
  const clause = source.slice(importIndex + "import".length, fromIndex);
  return /^\s*type\s/.test(clause);
}

for (const file of walk(srcRoot)) {
  const source = fs.readFileSync(file, "utf8");
  const fromModule = moduleName(file);
  for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (!specifier.startsWith(".")) continue;
    const target = path.resolve(path.dirname(file), specifier.replace(/\.js$/, ".ts"));
    const toModule = moduleName(target);
    const typeOnly = isTypeOnlyImport(source, match.index);

    if (fromModule && target.includes(`${path.sep}infrastructure${path.sep}`)) {
      violations.push(`${path.relative(root, file)}: business modules cannot import infrastructure adapters`);
    }
    if (fromModule && toModule && fromModule !== toModule) {
      const allowed =
        target.endsWith(`${path.sep}index.ts`) ||
        target.endsWith(".contract.ts") ||
        target.includes(`${path.sep}ports${path.sep}`) ||
        // 模型之间存在数据库外键关系，跨模块引用无法避免；但只允许类型引用：
        // `import type` 编译后被擦除，不会在模块之间建立运行时依赖，模型实例仍统一由 db/models.ts 注册。
        (typeOnly && target.endsWith(".model.ts"));
      if (!allowed) {
        violations.push(
          `${path.relative(root, file)}: cross-module import must target index, contract, port, or (type-only) model (${specifier})`,
        );
      }
    }
    if (file.endsWith(".service.ts") && target.includes(`${path.sep}middlewares${path.sep}`)) {
      violations.push(`${path.relative(root, file)}: application services cannot depend on HTTP middleware`);
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("architecture boundaries are valid");
