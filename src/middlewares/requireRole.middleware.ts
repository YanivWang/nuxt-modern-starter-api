/**
 * 文件职责：角色授权中间件。
 *
 * 认证（authMiddleware）回答「你是谁」，授权回答「你能不能做这件事」。
 * 两者分开挂载：把它们揉进一个中间件会让「这条路由到底要不要管理员」
 * 从路由定义里消失，只能靠读实现来推断。
 *
 * 角色由注入的 lookupRole 每次请求现查，而不是从 JWT payload 里读 ——
 * token 里的角色在签发那一刻就固化了，撤销管理员之后他手上的 access token
 * 仍然是管理员，直到自然过期。授权判据必须能被立即撤销。
 */
import { forbidden, unauthorized } from "../shared/errors/app-error.js";

import { asyncMiddleware } from "./asyncHandler.js";

import type { UserRole } from "../modules/user/user.contract.js";
import type { RequestHandler } from "express";

/** 由组合根从用户模块注入；返回 null 表示账号已不存在。 */
export type RoleLookup = (userId: number) => Promise<UserRole | null>;

export function createRequireRole(lookupRole: RoleLookup) {
  return function requireRole(...allowed: readonly UserRole[]): RequestHandler {
    return asyncMiddleware(async function roleGuard(req, _res, next) {
      const userId = req.user?.id;
      if (userId == null) {
        // 正常情况下 authMiddleware 已经挡在前面；这里兜住「漏挂认证中间件」的路由配置错误，
        // 让它变成 401 而不是一次放行。
        next(unauthorized("未登录或无效登录凭证"));
        return;
      }

      const role = await lookupRole(userId);
      if (role === null) {
        // token 签名仍然有效但账号已被删除。
        next(unauthorized("用户不存在或登录已失效，请重新登录"));
        return;
      }

      if (!allowed.includes(role)) {
        next(forbidden("需要管理员权限"));
        return;
      }

      next();
    });
  };
}

export type RequireRole = ReturnType<typeof createRequireRole>;
