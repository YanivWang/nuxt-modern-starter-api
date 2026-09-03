/**
 * 文件职责：周期性清理会随时间单调增长的数据。
 *
 * 每张只增不减的表和每个只写不删的目录，最终都会变成一次生产事故。
 * 这里统一调度两类清理：过期/已撤销的 refresh token 会话行，以及掉线遗留的大文件上传临时分片。
 */
import { CLEANUP_INTERVAL_MS, REFRESH_TOKEN_RETENTION_DAYS, UPLOAD_TEMP_RETENTION_HOURS } from "../../env.js";
import { logger, serializeError } from "../../utils/logger.js";

import type { LargeUploadStorage } from "../../modules/upload/index.js";

type CleanupDependencies = {
  purgeExpiredSessions: (retentionDays: number) => Promise<number>;
  largeUploads: LargeUploadStorage;
};

export function createCleanupScheduler({ purgeExpiredSessions, largeUploads }: CleanupDependencies) {
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  async function runOnce() {
    // 单实例内自我互斥：清理耗时超过间隔时不叠加执行。
    if (running) return;
    running = true;
    try {
      const removedSessions = await purgeExpiredSessions(REFRESH_TOKEN_RETENTION_DAYS);
      const uploads = await largeUploads.purgeStale(UPLOAD_TEMP_RETENTION_HOURS);
      logger.info("cleanup_completed", {
        removedRefreshTokens: removedSessions,
        removedUploadDirs: uploads.removedUploads,
        removedUploadSessions: uploads.removedSessions,
        removedUploadMarkers: uploads.removedMarkers,
      });
    } catch (error) {
      // 清理失败不能影响在线服务，记录后等待下一轮。
      logger.error("cleanup_failed", { error: serializeError(error) });
    } finally {
      running = false;
    }
  }

  return {
    runOnce,
    start() {
      if (timer) return;
      timer = setInterval(() => void runOnce(), CLEANUP_INTERVAL_MS);
      // unref 让定时器不阻止进程退出，优雅关闭时无需等待下一次触发。
      timer.unref();
      logger.info("cleanup_scheduler_started", { intervalMs: CLEANUP_INTERVAL_MS });
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
  };
}

export type CleanupScheduler = ReturnType<typeof createCleanupScheduler>;
