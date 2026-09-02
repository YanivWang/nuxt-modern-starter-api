/**
 * 文件职责：钉住角色授权中间件的判定。
 *
 * 这一层的每一条分支都是「放行 / 不放行」，写错任何一条都不会有功能异常，
 * 只会安静地把权限敞开或者把管理员挡在外面，因此逐条断言。
 */
import { describe, expect, it, vi } from "vitest";

import { createRequireRole } from "../../../src/middlewares/requireRole.middleware.js";

import type { AppError } from "../../../src/shared/errors/app-error.js";
import type { UserRole } from "../../../src/modules/user/user.contract.js";
import type { NextFunction, Request, Response } from "express";

/** 跑一次中间件，返回它交给 next 的错误（放行时为 undefined）。 */
async function run(lookup: (id: number) => Promise<UserRole | null>, user: { id: number } | undefined) {
  const requireAdmin = createRequireRole(lookup)("admin");
  const req = { user } as unknown as Request;

  return new Promise<AppError | undefined>((resolve) => {
    const next: NextFunction = (error?: unknown) => resolve(error as AppError | undefined);
    requireAdmin(req, {} as Response, next);
  });
}

const asAdmin = () => Promise.resolve<UserRole | null>("admin");
const asUser = () => Promise.resolve<UserRole | null>("user");
const asMissing = () => Promise.resolve<UserRole | null>(null);

describe("requireRole", () => {
  it("lets an admin through", async () => {
    expect(await run(asAdmin, { id: 1 })).toBeUndefined();
  });

  it("rejects an ordinary logged-in user with 403, not 401", async () => {
    // 401 会让前端去刷新 token 再重试；这里重试多少次都不会有结果，必须是 403。
    const error = await run(asUser, { id: 2 });

    expect(error?.code).toBe("FORBIDDEN");
    expect(error?.message).toBe("需要管理员权限");
  });

  it("rejects a request that never went through authentication", async () => {
    // 兜住「路由漏挂 authMiddleware」这种配置错误：必须是拒绝，不能是放行。
    const lookup = vi.fn(asAdmin);
    const error = await run(lookup, undefined);

    expect(error?.code).toBe("UNAUTHORIZED");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects a still-valid token whose account has been deleted", async () => {
    expect((await run(asMissing, { id: 3 }))?.code).toBe("UNAUTHORIZED");
  });

  it("reads the role per request so revoking admin takes effect immediately", async () => {
    // 角色若来自 JWT payload，撤销管理员之后他手上的 token 仍然是管理员，
    // 直到自然过期（默认 15 分钟）。这条断言锁住「每次都查」这个行为。
    let role: UserRole = "admin";
    const lookup = vi.fn(() => Promise.resolve<UserRole | null>(role));
    const requireAdmin = createRequireRole(lookup)("admin");

    const call = () =>
      new Promise<AppError | undefined>((resolve) => {
        requireAdmin(
          { user: { id: 9 } } as unknown as Request,
          {} as Response,
          ((error?: unknown) => resolve(error as AppError | undefined)) as NextFunction,
        );
      });

    expect(await call()).toBeUndefined();
    role = "user";
    expect((await call())?.code).toBe("FORBIDDEN");
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("surfaces a lookup failure instead of failing open", async () => {
    // 查库失败时若吞掉异常继续 next()，一次数据库抖动就等于全站权限敞开。
    const error = await run(() => Promise.reject(new Error("db down")), { id: 4 });

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("db down");
  });
});
