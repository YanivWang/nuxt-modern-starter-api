/**
 * 文件职责：解析和强制校验 access token。
 * 返回的 resolve/require 分别服务于可选登录态和强制登录态，都会检查 jti 是否已进入黑名单。
 *
 * 黑名单存储（Redis）不可用时，两条路径的处理刻意不同：
 * require 抛 500（拒绝但如实报告是服务端故障），resolve 降级为匿名（只会减少权限）。
 * 把两者都做成 401 是错的 —— 那会让一次 Redis 抖动被前端读成「凭证失效」并清掉会话，
 * 全体在线用户被强制登出，而日志上只留下一片「无效登录凭证」。
 */
import jwt from "jsonwebtoken";

import { JWT_SECRET } from "../../env.js";
import { internalError } from "../../shared/errors/app-error.js";
import { logger, serializeError } from "../../utils/logger.js";

import type { TokenBlacklist } from "./ports/token-blacklist.port.js";
import type { AppJwtUser } from "../../types/jwt-user.js";

export function createJwtVerifier(blacklist: TokenBlacklist) {
  /**
   * 查询吊销状态。查不通时**不能**当成「未吊销」，那等于在依赖故障期间让已登出的
   * token 重新可用；也不能当成「已吊销」，那会把一次基础设施故障变成全员登出。
   * 因此这里如实抛错，由调用方按「必须登录」还是「可选登录」分别决定怎么处理。
   */
  async function isRevoked(jti: string): Promise<boolean> {
    try {
      return await blacklist.has(jti);
    } catch (error) {
      throw internalError("无法校验 token 吊销状态（黑名单存储不可用）", error);
    }
  }

  return {
    /**
     * 校验 JWT；无效、过期、缺 jti、已拉黑 → null（不抛错）。
     *
     * 黑名单查不通时按匿名处理而不是抛错：这条路径的调用方本来就允许匿名，
     * 降级只会**减少**权限，不会放行任何本不该放行的东西；
     * 而在这里抛错会让一次 Redis 抖动把允许匿名的公开页也一并打挂。
     * 但必须留下日志——静默降级会让「登录用户忽然都变成游客」查无实据。
     */
    async resolve(token: string): Promise<AppJwtUser | null> {
      let user: AppJwtUser;
      try {
        user = jwt.verify(token, JWT_SECRET) as AppJwtUser;
      } catch {
        return null;
      }

      if (!user.jti) return null;

      try {
        return (await isRevoked(user.jti)) ? null : user;
      } catch (error) {
        logger.warn("token_blacklist_unavailable_degraded_to_anonymous", {
          userId: user.id,
          error: serializeError(error),
        });
        return null;
      }
    },
    /** 校验 JWT；失败抛 Error，供 auth 中间件映射为 401 */
    async require(token: string): Promise<AppJwtUser> {
      return assertUsable(jwt.verify(token, JWT_SECRET) as AppJwtUser);
    },
    /**
     * 校验签名与黑名单，但忽略过期时间。
     * 仅供登出使用：access token 过期后用户依然必须能主动撤销 refresh token 会话，
     * 否则「怀疑账号被盗」这个最需要登出的场景反而无法登出。
     * 签名仍然必须有效，因此不会放大攻击面。
     */
    async requireAllowExpired(token: string): Promise<AppJwtUser> {
      return assertUsable(jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as AppJwtUser);
    },
  };

  async function assertUsable(user: AppJwtUser): Promise<AppJwtUser> {
    if (!user.jti) {
      throw new jwt.JsonWebTokenError("missing jti");
    }
    // isRevoked 查不通时抛的是 AppError(INTERNAL)，会被 auth 中间件原样放行到错误中间件，
    // 最终是 500 而不是 401 —— 见该中间件里对 AppError 的处理。
    if (await isRevoked(user.jti)) {
      throw new jwt.TokenExpiredError("blacklisted", new Date());
    }
    return user;
  }
}

export type JwtVerifier = ReturnType<typeof createJwtVerifier>;
