import compression from "compression";

import type { Request, Response } from "express";

/** 仅压缩典型 API JSON；HTML/CSS/JS/SVG 由 CDN/Nginx；流式与二进制不压。 */
const THRESHOLD_BYTES = 2048;

function contentTypeBase(res: Response) {
  const ct = res.getHeader("Content-Type");
  if (ct == null) return "";
  return String(ct).split(";")[0].trim().toLowerCase();
}

function isExcludedNonJson(base: string) {
  if (!base) return true;
  if (base === "text/event-stream") return true;
  if (base.startsWith("multipart/")) return true;
  if (base.startsWith("image/")) return true;
  if (base.startsWith("video/")) return true;
  if (base.startsWith("audio/")) return true;
  if (base.startsWith("font/")) return true;
  if (base === "application/octet-stream") return true;
  if (base === "application/pdf") return true;
  if (base === "application/zip" || base === "application/gzip" || base === "application/x-gzip")
    return true;
  if (base === "application/x-ndjson") return true;
  return false;
}

function isApiJsonFamily(base: string) {
  if (base === "application/json") return true;
  if (base === "application/problem+json") return true;
  if (base.endsWith("+json")) return true;
  return false;
}

const shouldCompress = (req: Request, res: Response) => {
  if (res.getHeader("x-no-compression")) {
    return false;
  }

  const base = contentTypeBase(res);
  if (isExcludedNonJson(base) || !isApiJsonFamily(base)) {
    return false;
  }

  return compression.filter(req, res);
};

export const compressionMiddleware = compression({
  threshold: THRESHOLD_BYTES,
  filter: shouldCompress,
});
