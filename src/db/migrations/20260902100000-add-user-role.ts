/**
 * 文件职责：为 Users 增加角色列。
 *
 * 此前公开内容的写接口只挂了 authMiddleware —— 那只回答「是不是登录用户」，
 * 不回答「有没有权限改站点内容」，于是任何注册用户都能删掉全站新闻。
 * 授权需要一个可判定的主体属性，这一列就是它。
 *
 * 默认值是 'user'：升级后所有存量账号都不是管理员，写接口对谁都关着，
 * 直到运维显式用 `pnpm db:grant-admin <username>` 授权。
 * 反过来（默认 admin 再逐个降权）会在升级瞬间把全站权限敞开。
 */
import { DataTypes } from "sequelize";

import type { QueryInterface } from "sequelize";
import type { MigrationFn } from "umzug";

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.addColumn("Users", "role", {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: "user",
    comment: "账号角色：user / admin。admin 才能写公开内容",
  });

  await context.addIndex("Users", ["role"], { name: "users_role_idx" });
};

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.removeIndex("Users", "users_role_idx");
  await context.removeColumn("Users", "role");
};
