/** 文件职责：通过 HTTP 调用 Nuxt revalidate 接口实现 ContentRevalidator Port。 */
import { logger } from "../../utils/logger.js";

import type { ContentRevalidator } from "../../modules/content/ports/content-revalidator.port.js";

export const getNewsRevalidatePaths = (slug: string) => {
  const normalized = slug.trim();
  return ["/news", `/news/${normalized}`, "/en/news", `/en/news/${normalized}`];
};

export function createNuxtContentRevalidator(options: { url?: string; secret?: string }): ContentRevalidator {
  async function revalidate(paths: readonly string[]) {
    const uniquePaths = [...new Set(paths.map((path) => path.trim()).filter(Boolean))];
    if (!options.url || !options.secret || uniquePaths.length === 0) return;
    try {
      const response = await fetch(options.url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-revalidate-secret": options.secret },
        body: JSON.stringify({ paths: uniquePaths }),
      });
      if (!response.ok) {
        logger.warn("revalidate_failed", {
          status: response.status,
          body: await response.text().catch(() => ""),
          paths: uniquePaths,
        });
      }
    } catch (error) {
      logger.warn("revalidate_failed", { paths: uniquePaths, error });
    }
  }

  return { revalidateNews: (slug) => void revalidate(getNewsRevalidatePaths(slug)) };
}
