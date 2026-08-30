/**
 * 文件职责：加载并校验运行环境变量。
 * Twelve-Factor：进程启动时已在环境中的变量优先级最高，不会被磁盘 .env.* 覆盖。
 */

import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

import { projectRoot } from "./utils/projectRoot.js";

const validEnvs = new Set(["development", "test", "production"]);

function trimUnset(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const t = value.trim();
  return t === "" ? undefined : t;
}

const injectedKeys = new Set(Object.keys(process.env));
const envBundle = trimUnset(process.env.APP_ENV) ?? trimUnset(process.env.NODE_ENV) ?? "development";

// 加载顺序为 .env.{APP_ENV} → .env.{APP_ENV}.local；已由外部注入的变量不会被覆盖。
for (const envFile of [`.env.${envBundle}`, `.env.${envBundle}.local`]) {
  const envPath = path.join(projectRoot, envFile);
  if (!fs.existsSync(envPath)) continue;

  const parsed = dotenv.parse(fs.readFileSync(envPath));
  for (const [key, value] of Object.entries(parsed)) {
    if (!injectedKeys.has(key)) process.env[key] = value;
  }
}

const mergedApp = trimUnset(process.env.APP_ENV);
const mergedNode = trimUnset(process.env.NODE_ENV);

// APP_ENV 用来选择配置文件，NODE_ENV 会影响依赖库行为；二者不一致时容易出现“读开发配置、按生产运行”的隐患。
if (mergedApp !== undefined && mergedNode !== undefined && mergedApp !== mergedNode) {
  console.error("[env] 同时设置了 APP_ENV 与 NODE_ENV 时二者必须一致（含磁盘 .env 合并后）");
  console.error(`[env] 当前 APP_ENV=${JSON.stringify(mergedApp)}，NODE_ENV=${JSON.stringify(mergedNode)}`);
  process.exit(1);
}

const appEnv = mergedApp ?? mergedNode ?? "development";

if (!validEnvs.has(appEnv)) {
  console.error(`[env] APP_ENV/NODE_ENV 只能是: ${Array.from(validEnvs).join(", ")}（当前: ${appEnv}）`);
  process.exit(1);
}

process.env.APP_ENV = appEnv;
if (!process.env.NODE_ENV) process.env.NODE_ENV = appEnv;

function requireEnv(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    console.error(`[env] 缺少或未配置环境变量: ${name}`);
    process.exit(1);
  }
  return raw.trim();
}

function requirePortLike(name: string, fallback: number): number {
  const raw = trimUnset(process.env[name]);
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    console.error(`[env] ${name} 必须是 1～65535 的整数`);
    process.exit(1);
  }
  return n;
}

function optionalPositiveInt(name: string, fallback: number): number {
  const raw = trimUnset(process.env[name]);
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`[env] ${name} 必须是正整数`);
    process.exit(1);
  }
  return n;
}

function optionalBoolean(name: string, fallback: boolean): boolean {
  const raw = trimUnset(process.env[name]);
  if (raw === undefined) return fallback;
  const lower = raw.toLowerCase();
  if (["1", "true", "yes", "on"].includes(lower)) return true;
  if (["0", "false", "no", "off"].includes(lower)) return false;
  console.error(`[env] ${name} 必须是布尔值: true/false/1/0/yes/no/on/off`);
  process.exit(1);
}

function rejectProductionPlaceholder(name: string, value: string) {
  if (appEnv !== "production") return;
  const lower = value.toLowerCase();
  if (lower.includes("replace_with") || lower.includes("change_me")) {
    console.error(`[env] 生产环境 ${name} 不能使用模板占位值，请配置真实密钥/密码`);
    process.exit(1);
  }
}

export const JWT_SECRET = (() => {
  const secret = requireEnv("JWT_SECRET");
  const minLen = 32;
  if (secret.length < minLen) {
    console.error(`[env] JWT_SECRET 长度至少 ${minLen} 字符（当前 ${secret.length}），请使用足够长的随机串`);
    process.exit(1);
  }
  const weak = new Set([
    "secret",
    "jwt_secret",
    "jwtsecret",
    "changeme",
    "password",
    "123456",
    "your-secret-key",
    "your_secret_key",
    "supersecret",
    "please_change_me",
  ]);
  if (weak.has(secret.toLowerCase())) {
    console.error("[env] JWT_SECRET 不能使用常见弱默认值，请换成随机生成的密钥");
    process.exit(1);
  }
  rejectProductionPlaceholder("JWT_SECRET", secret);
  return secret;
})();

export const PORT = requirePortLike("PORT", 3000);
export const DB_PORT = requirePortLike("DB_PORT", 3306);
export const AUTH_TOKEN_BLACKLIST_ENABLED = optionalBoolean("AUTH_TOKEN_BLACKLIST_ENABLED", true);
// Redis 当前只服务于 JWT 黑名单；关闭黑名单时允许不提供 REDIS_URL。
export const REDIS_URL = AUTH_TOKEN_BLACKLIST_ENABLED ? requireEnv("REDIS_URL") : trimUnset(process.env.REDIS_URL);
export const DB_HOST = requireEnv("DB_HOST");
export const DB_USER = requireEnv("DB_USER");
export const DB_PWD = (() => {
  const password = requireEnv("DB_PWD");
  rejectProductionPlaceholder("DB_PWD", password);
  return password;
})();
export const DB_NAME = requireEnv("DB_NAME");
export const APP_ENV = appEnv;
export const TRUST_PROXY = trimUnset(process.env.TRUST_PROXY);
export const RATE_LIMIT_WINDOW_MS = optionalPositiveInt("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000);
export const RATE_LIMIT_MAX = optionalPositiveInt("RATE_LIMIT_MAX", appEnv === "production" ? 1000 : 10000);
export const AUTH_RATE_LIMIT_WINDOW_MS = optionalPositiveInt("AUTH_RATE_LIMIT_WINDOW_MS", 60 * 1000);
export const AUTH_RATE_LIMIT_MAX = optionalPositiveInt("AUTH_RATE_LIMIT_MAX", 60);
export const ACCESS_TOKEN_TTL_SECONDS = optionalPositiveInt("ACCESS_TOKEN_TTL_SECONDS", 15 * 60);
export const REFRESH_TOKEN_TTL_SECONDS = optionalPositiveInt("REFRESH_TOKEN_TTL_SECONDS", 30 * 24 * 60 * 60);
export const AUTH_COOKIE_SECURE = optionalBoolean("AUTH_COOKIE_SECURE", appEnv === "production");
/** bcrypt 代价因子。12 是当前通行的下限；提高会线性增加登录 CPU 开销。 */
export const BCRYPT_ROUNDS = (() => {
  const rounds = optionalPositiveInt("BCRYPT_ROUNDS", 12);
  if (rounds < 10 || rounds > 15) {
    console.error("[env] BCRYPT_ROUNDS 必须在 10～15 之间（过低不安全，过高会拖慢登录）");
    process.exit(1);
  }
  return rounds;
})();
export const LOGIN_MAX_FAILED_ATTEMPTS = optionalPositiveInt("LOGIN_MAX_FAILED_ATTEMPTS", 10);
export const LOGIN_LOCKOUT_SECONDS = optionalPositiveInt("LOGIN_LOCKOUT_SECONDS", 15 * 60);
/** refresh token 会话行的保留天数，超过后由清理任务删除。 */
export const REFRESH_TOKEN_RETENTION_DAYS = optionalPositiveInt("REFRESH_TOKEN_RETENTION_DAYS", 7);
/** 后台清理任务的执行间隔。 */
export const CLEANUP_INTERVAL_MS = optionalPositiveInt("CLEANUP_INTERVAL_MS", 6 * 60 * 60 * 1000);
/** 大文件上传临时分片的最大留存小时数，超过即视为废弃任务。 */
export const UPLOAD_TEMP_RETENTION_HOURS = optionalPositiveInt("UPLOAD_TEMP_RETENTION_HOURS", 24);

export const REQUEST_BODY_LIMIT = trimUnset(process.env.REQUEST_BODY_LIMIT) ?? "1mb";
export const NUXT_REVALIDATE_URL = trimUnset(process.env.NUXT_REVALIDATE_URL);
export const REVALIDATE_SECRET = trimUnset(process.env.REVALIDATE_SECRET);

export const CORS_ORIGINS = (() => {
  const raw = trimUnset(process.env.CORS_ORIGINS);
  if (raw === undefined) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
})();

export function getCorsOriginOption(): boolean | string | string[] {
  // 开发/测试默认放开来源便于本地调试；生产必须显式配置白名单，否则浏览器跨域请求会被拒绝。
  if (appEnv === "development" || appEnv === "test") {
    if (CORS_ORIGINS.length === 0) return true;
    if (CORS_ORIGINS.length === 1) return CORS_ORIGINS[0];
    return CORS_ORIGINS;
  }
  if (CORS_ORIGINS.length === 0) return false;
  if (CORS_ORIGINS.length === 1) return CORS_ORIGINS[0];
  return CORS_ORIGINS;
}
