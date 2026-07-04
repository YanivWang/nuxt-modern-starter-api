/**
 * 文件职责：创建全局结构化 logger。
 * 开发环境默认同时输出文件与彩色控制台，生产环境默认输出 JSON 到 stdout/stderr 供容器平台采集。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import winston from "winston";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logDir = path.resolve(__dirname, "../../logs");

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

/** JSON 序列化时 Error 的 message/stack 不可枚举会丢失，转成普通对象再记日志 */
export function serializeError(value: unknown): unknown {
  if (!(value instanceof Error)) {
    return value;
  }
  const err = value as Error & Record<string, unknown>;
  const out: Record<string, unknown> = {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };
  for (const key of Object.keys(err)) {
    if (Object.prototype.hasOwnProperty.call(out, key)) continue;
    const v = err[key];
    out[key] = v instanceof Error ? serializeError(v) : v;
  }
  if ("cause" in err && err.cause !== undefined) {
    const { cause } = err;
    out.cause = cause instanceof Error ? serializeError(cause) : cause;
  }
  return out;
}

const consoleFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaText = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  const primary = stack ?? message;
  let body: string;
  if (typeof primary === "string") {
    body = primary;
  } else if (primary == null) {
    body = "";
  } else if (typeof primary === "object") {
    body = JSON.stringify(primary);
  } else if (typeof primary === "number" || typeof primary === "boolean") {
    body = String(primary);
  } else if (typeof primary === "bigint") {
    body = primary.toString();
  } else if (typeof primary === "symbol") {
    body = primary.description ?? primary.toString();
  } else {
    body = "";
  }
  const tsPart = typeof ts === "string" ? ts : "";
  const levelPart = typeof level === "string" ? level : "";
  return `${tsPart} ${levelPart}: ${body}${metaText}`;
});

const logToFile = process.env.LOG_TO_FILE === "true" || process.env.NODE_ENV !== "production";
const transports: winston.transport[] = [];

if (logToFile) {
  fs.mkdirSync(logDir, { recursive: true });
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
    }),
  );
}

transports.push(
  new winston.transports.Console({
    format:
      process.env.NODE_ENV === "production"
        ? combine(timestamp(), errors({ stack: true }), json())
        : combine(colorize(), timestamp(), errors({ stack: true }), consoleFormat),
  }),
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(timestamp(), errors({ stack: true }), json()),
  transports,
});
