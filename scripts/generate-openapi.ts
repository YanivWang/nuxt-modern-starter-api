/**
 * 文件职责：生成或校验 docs/openapi.yaml。
 * --check 用于 CI，默认模式会把 src/openapi.ts 的运行时定义写入仓库文档。
 */
import fs from "node:fs";
import path from "node:path";

import yaml from "js-yaml";

import { openApiYaml } from "../src/openapi.js";
import { projectRoot } from "../src/utils/projectRoot.js";

const outPath = path.join(projectRoot, "docs", "openapi.yaml");
const nextYaml = openApiYaml();
const mode = process.argv[2] ?? "write";

if (mode === "--check") {
  const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : "";
  const currentSpec = current ? yaml.load(current) : null;
  const nextSpec = yaml.load(nextYaml);

  if (JSON.stringify(currentSpec) !== JSON.stringify(nextSpec)) {
    console.error("[openapi] docs/openapi.yaml is out of date. Run: pnpm openapi:generate");
    process.exit(1);
  }

  console.log("[openapi] docs/openapi.yaml is up to date");
} else if (mode === "write") {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, nextYaml, "utf8");
  console.log(`[openapi] generated ${path.relative(projectRoot, outPath)}`);
} else {
  console.error(`[openapi] unknown mode: ${mode}`);
  process.exit(1);
}
