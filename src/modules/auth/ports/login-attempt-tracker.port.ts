/**
 * 文件职责：声明登录失败计数与账号锁定所需能力。
 * 按 IP 限流拦不住分布式撞库——攻击者换 IP 即可绕过，
 * 因此还需要按账号维度统计失败次数并在超阈值后临时锁定。
 */
export interface LoginAttemptTracker {
  /** 该账号当前是否处于锁定期。 */
  isLocked(username: string): Promise<boolean>;
  /** 记录一次失败，返回累计失败次数。 */
  recordFailure(username: string): Promise<number>;
  /** 登录成功后清零。 */
  reset(username: string): Promise<void>;
}
