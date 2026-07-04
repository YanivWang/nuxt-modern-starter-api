import type { Request } from "express";

/** Express 在匹配路由后填充 `req.route`；类型定义较宽松，此处安全读出 pattern */
export function expressRoutePath(req: Request): string | undefined {
  /* eslint-disable @typescript-eslint/no-unsafe-assignment -- @types/express 中 route 过宽 */
  const route = req.route;
  /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  if (!route || typeof route !== "object") return undefined;
  const path = "path" in route ? (route as { path?: unknown }).path : undefined;
  return typeof path === "string" ? path : undefined;
}
