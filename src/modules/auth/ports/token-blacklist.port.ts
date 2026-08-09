/** 文件职责：声明 access token 黑名单所需能力。 */
export interface TokenBlacklist {
  add(jti: string, ttlSeconds: number): Promise<void>;
  has(jti: string): Promise<boolean>;
}
