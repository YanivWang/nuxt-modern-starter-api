#!/usr/bin/env node
/**
 * 文件职责：校验同机前端仓库引入的 OpenAPI 副本是否已与本仓库同步。
 *
 * 前端把契约「引入」为 contracts/openapi.yaml，它自己的 contract:check 会在本仓库存在时比对。
 * 但那条检查只在前端的门禁里跑——后端改完契约、跑完自己的 pnpm check 全绿，
 * 完全可能不知道前端的副本已经落后。这里补上反向的一半：谁改的契约，谁的门禁先红。
 *
 * 找不到前端仓库时跳过（退出码 0）：后端 CI 里通常没有前端源码，
 * 那种情况下的漂移由前端自己的 contract:check 兜底。
 *
 * 用法：
 *   node scripts/check-consumer-contract.mjs
 *   node scripts/check-consumer-contract.mjs --consumer <path-to-frontend-repo>
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = resolve(ROOT, "docs", "openapi.yaml");

const args = process.argv.slice(2);
const consumerIndex = args.indexOf("--consumer");
const consumerRoot =
  consumerIndex >= 0 ? resolve(args[consumerIndex + 1] ?? "") : resolve(ROOT, "../nuxt-modern-starter");
const vendored = resolve(consumerRoot, "contracts", "openapi.yaml");

if (!existsSync(vendored)) {
  console.log(`[consumer-contract] 跳过：未找到前端引入副本 ${vendored}`);
  process.exit(0);
}

if (!existsSync(SPEC)) {
  console.error("[consumer-contract] 缺少 docs/openapi.yaml。修复：pnpm openapi:generate");
  process.exit(1);
}

if (readFileSync(SPEC, "utf8") !== readFileSync(vendored, "utf8")) {
  console.error(
    "[consumer-contract] 前端引入的契约副本已落后于本仓库。\n" +
      `  修复：在 ${consumerRoot} 执行 pnpm contract:sync，` +
      "然后跑它的 pnpm test 看契约测试是否变红，按需调整 adapter、类型与 E2E 桩后端。",
  );
  process.exit(1);
}

console.log("[consumer-contract] 前端引入副本与本仓库一致");
