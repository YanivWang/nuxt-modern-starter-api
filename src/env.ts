// 启动前集中校验环境变量。
// Twelve-Factor：进程启动时已在环境中的变量优先级最高，不会被磁盘 .env.* 覆盖。

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

export const CORS_ORIGINS = (() => {
  const raw = trimUnset(process.env.CORS_ORIGINS);
  if (raw === undefined) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
})();

export function getCorsOriginOption(): boolean | string | string[] {
  if (appEnv === "development" || appEnv === "test") {
    if (CORS_ORIGINS.length === 0) return true;
    if (CORS_ORIGINS.length === 1) return CORS_ORIGINS[0];
    return CORS_ORIGINS;
  }
  if (CORS_ORIGINS.length === 0) return false;
  if (CORS_ORIGINS.length === 1) return CORS_ORIGINS[0];
  return CORS_ORIGINS;
}
