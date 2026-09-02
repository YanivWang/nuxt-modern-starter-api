#!/usr/bin/env node
/**
 * 文件职责：校验 .env.production.example 里的应用级变量都真的传进了生产 api 容器。
 *
 * 生产 Compose 不用 env_file 整份注入（.env.production 里还有 MYSQL_ROOT_PASSWORD 这类
 * 只属于数据库容器的秘密），而是在 api 的 environment 块里逐个显式映射。
 * 于是同一份配置面被手工维护了两遍，漏一个不会有任何报错 ——
 * 表现是「运维照文档改了 RATE_LIMIT_MAX，重启后毫无效果」，或者更糟：
 * NUXT_REVALIDATE_URL/REVALIDATE_SECRET 传不进去，on-demand revalidation 在生产里
 * 一直静默不工作，而代码里那条路径恰好是「没配就跳过」。
 *
 * 这个脚本把「两份清单必须一致」变成一条门禁断言。
 *
 * 用法：node scripts/check-env-wiring.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 不需要出现在 api 容器环境里的变量，逐个写明原因。
 * 新增豁免必须在这里留下理由——否则这份名单会变成「把报错关掉」的垃圾桶。
 */
const NOT_FOR_API_CONTAINER = new Map([
  ["MYSQL_ROOT_PASSWORD", "只给 mysql 容器；API 进程不该持有数据库 root 口令"],
  ["REDIS_PASSWORD", "只用于拼 base compose 里的 REDIS_URL 和 redis 容器启动参数"],
  ["GATEWAY_HOST_PORT", "只用于 gateway 的端口映射"],
  ["NPM_REGISTRY", "只是镜像构建参数"],
  ["DB_HOST", "由 base compose 固定为服务名 mysql"],
  ["REDIS_URL", "由 base compose 用服务名 redis 拼出"],
  ["APP_ENV", "由 compose 固定为 production"],
  ["NODE_ENV", "由 compose 固定为 production"],
]);

const read = (relative) => readFileSync(resolve(ROOT, relative), "utf8");

/** 读 .env 模板里声明的变量名（忽略注释与空行）。 */
function declaredEnvKeys(relative) {
  return new Set(
    read(relative)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => line.slice(0, line.indexOf("=")).trim()),
  );
}

/** 读生产 compose 里 api 服务 environment 块显式映射的变量名。 */
function wiredEnvKeys() {
  const compose = read("docker/docker-compose.yaml");
  const apiSection = compose.split("\n  api:")[1];
  if (apiSection === undefined) {
    console.error("[env-wiring] docker/docker-compose.yaml 里找不到 api 服务");
    process.exit(1);
  }
  // environment 块的条目缩进 6 空格；volumes 等同级键缩进 4 空格，因此按缩进就能划出边界
  return new Set([...apiSection.matchAll(/^ {6}([A-Z_0-9]+):/gm)].map((match) => match[1]));
}

const declared = declaredEnvKeys(".env.production.example");
const wired = wiredEnvKeys();

const missing = [...declared].filter((key) => !wired.has(key) && !NOT_FOR_API_CONTAINER.has(key)).sort();

if (missing.length > 0) {
  console.error("[env-wiring] 这些变量写在 .env.production.example 里，却没有传进生产 api 容器：");
  for (const key of missing) console.error(`  - ${key}`);
  console.error("");
  console.error("运维照模板配置它们不会有任何效果。修复：在 docker/docker-compose.yaml 的 api.environment");
  console.error("里补上映射；确实不该进 API 容器的，加进本脚本的 NOT_FOR_API_CONTAINER 并写明原因。");
  process.exit(1);
}

// 反向检查：豁免名单不该留着已经不存在的变量，否则它会慢慢变成一份没人敢动的历史遗留
const staleExemptions = [...NOT_FOR_API_CONTAINER.keys()].filter((key) => !declared.has(key)).sort();

if (staleExemptions.length > 0) {
  console.error("[env-wiring] 豁免名单里这些变量已经不在 .env.production.example 中，请删掉：");
  for (const key of staleExemptions) console.error(`  - ${key}`);
  process.exit(1);
}

console.log(`[env-wiring] .env.production.example 的 ${declared.size} 个变量都已正确落位`);
