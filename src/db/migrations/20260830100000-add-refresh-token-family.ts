/**
 * 文件职责：为 UserRefreshTokens 增加 token 家族与撤销原因字段。
 * familyId 把一次登录派生出的所有轮换 token 归为同一家族，使检测到重放时可以一次性撤销整条链
 * （OAuth 2.0 Security BCP 要求的 refresh token replay detection）。
 */
import { DataTypes } from "sequelize";

import type { QueryInterface } from "sequelize";
import type { MigrationFn } from "umzug";

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.addColumn("UserRefreshTokens", "familyId", {
    type: DataTypes.UUID,
    allowNull: true,
    comment: "同一次登录派生出的 token 家族标识；重放检测命中时按家族整体撤销",
  });

  await context.addColumn("UserRefreshTokens", "revokedReason", {
    type: DataTypes.STRING(40),
    allowNull: true,
    comment: "撤销原因：rotated / logout / replay_detected / user_missing",
  });

  // 历史行没有家族信息。MySQL 的 UUID() 是逐行求值的，因此这条 UPDATE 会给每一行发一个
  // 不同的家族 id —— 旧会话各自独立成家族，不会被重放检测误判成同一条链而互相牵连。
  await context.sequelize.query("UPDATE `UserRefreshTokens` SET `familyId` = UUID() WHERE `familyId` IS NULL");

  await context.changeColumn("UserRefreshTokens", "familyId", {
    type: DataTypes.UUID,
    allowNull: false,
    comment: "同一次登录派生出的 token 家族标识；重放检测命中时按家族整体撤销",
  });

  await context.addIndex("UserRefreshTokens", ["familyId"], {
    name: "user_refresh_tokens_family_id_idx",
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.removeIndex("UserRefreshTokens", "user_refresh_tokens_family_id_idx");
  await context.removeColumn("UserRefreshTokens", "revokedReason");
  await context.removeColumn("UserRefreshTokens", "familyId");
};
