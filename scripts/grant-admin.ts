/**
 * 文件职责：授予/收回账号的 admin 角色。
 *
 * 内容写接口要求 admin，而 role 列默认是 user —— 也就是说全新部署里没有任何管理员，
 * 写接口对所有人关着。这是刻意的：默认开放再逐个收回，会在升级的那一瞬间把全站权限敞开。
 * 第一个管理员由运维用这个脚本显式授予，这一步在服务器上留下明确的操作痕迹。
 *
 * 用法：
 *   pnpm db:grant-admin <username>
 *   pnpm db:grant-admin <username> --revoke
 *   pnpm db:grant-admin --list
 */
import { database } from "../src/db/index.js";

import type { UserRole } from "../src/modules/user/user.contract.js";

const USAGE = `用法：
  pnpm db:grant-admin <username>            授予 admin
  pnpm db:grant-admin <username> --revoke   收回为 user
  pnpm db:grant-admin --list                列出当前所有 admin`;

async function listAdmins() {
  const { User } = database.models;
  const admins = await User.findAll({ where: { role: "admin" }, attributes: ["id", "username"] });
  if (admins.length === 0) {
    console.log("当前没有任何 admin，内容写接口对所有人关闭。");
    return;
  }
  console.log(`当前 admin 共 ${admins.length} 个：`);
  for (const admin of admins) console.log(`  #${admin.id} ${admin.username}`);
}

async function setRole(username: string, role: UserRole) {
  const { User } = database.models;
  const user = await User.findOne({ where: { username } });
  if (!user) {
    console.error(`找不到用户名为 ${JSON.stringify(username)} 的账号`);
    process.exitCode = 1;
    return;
  }

  const previous = user.role;
  if (previous === role) {
    console.log(`${username} 已经是 ${role}，无需改动`);
    return;
  }

  await user.update({ role });
  console.log(`${username}: ${previous} → ${role}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--list")) {
    await listAdmins();
    return;
  }

  const username = args.find((arg) => !arg.startsWith("--"));
  if (!username) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  await setRole(username, args.includes("--revoke") ? "user" : "admin");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await database.disconnect().catch(() => {});
  });
