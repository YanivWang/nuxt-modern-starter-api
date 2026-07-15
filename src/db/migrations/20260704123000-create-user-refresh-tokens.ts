/**
 * 文件职责：创建 UserRefreshTokens 表。
 * 表用于保存 refresh token 摘要、撤销状态和轮换关系，并为用户查询和过期清理预留索引。
 */
import { DataTypes } from "sequelize";

import type { QueryInterface } from "sequelize";
import type { MigrationFn } from "umzug";

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.createTable("UserRefreshTokens", {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Users.id，refresh token 所属用户",
      references: {
        model: "Users",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    tokenHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      comment: "refresh token SHA-256 摘要，不落库明文 token",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    replacedByTokenHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    ipAddress: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  await context.addIndex("UserRefreshTokens", ["userId"], {
    name: "user_refresh_tokens_user_id_idx",
  });

  await context.addIndex("UserRefreshTokens", ["expiresAt"], {
    name: "user_refresh_tokens_expires_at_idx",
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.dropTable("UserRefreshTokens");
};
