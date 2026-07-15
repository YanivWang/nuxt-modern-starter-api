/**
 * 文件职责：通知 Nuxt server 清除 SWR 页面缓存。
 * 该工具只做 best-effort 通知，调用方不应因为前端缓存刷新失败而回滚 API 写操作。
 */
import { NUXT_REVALIDATE_URL, REVALIDATE_SECRET } from "../env.js";
import { logger } from "./logger.js";

export function getNewsRevalidatePaths(slug: string) {
  const normalizedSlug = slug.trim();
  return ["/news", `/news/${normalizedSlug}`, "/en/news", `/en/news/${normalizedSlug}`];
}

export async function revalidatePaths(paths: readonly string[]) {
  const uniquePaths = [...new Set(paths.map((path) => path.trim()).filter(Boolean))];

  if (uniquePaths.length === 0) {
    return;
  }

  if (!NUXT_REVALIDATE_URL) {
    logger.debug("revalidate_skipped", {
      reason: "NUXT_REVALIDATE_URL not configured",
      paths: uniquePaths,
    });
    return;
  }

  if (!REVALIDATE_SECRET) {
    logger.warn("revalidate_skipped", {
      reason: "REVALIDATE_SECRET not configured",
      paths: uniquePaths,
    });
    return;
  }

  try {
    const response = await fetch(NUXT_REVALIDATE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-revalidate-secret": REVALIDATE_SECRET,
      },
      body: JSON.stringify({ paths: uniquePaths }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.warn("revalidate_failed", {
        status: response.status,
        body,
        paths: uniquePaths,
      });
    }
  } catch (error) {
    logger.warn("revalidate_failed", {
      paths: uniquePaths,
      error,
    });
  }
}

export function revalidateNewsPaths(slug: string) {
  // 内容写接口采用 fire-and-forget，避免 Nuxt 暂时不可达时拖慢或打断 API 响应。
  void revalidatePaths(getNewsRevalidatePaths(slug));
}
