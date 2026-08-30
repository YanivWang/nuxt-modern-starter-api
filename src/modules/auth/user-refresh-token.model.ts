/**
 * 文件职责：定义 refresh token 会话模型。
 * 表中只保存 token 摘要、过期时间、撤销时间和轮换关系，不保存明文 refresh token。
 * familyId 把一次登录派生出的所有轮换 token 归为一个家族，是重放检测按家族撤销的依据。
 */
import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

import type { User } from "../user/user.model.js";

/** 撤销原因，用于安全审计区分正常轮换与异常撤销。 */
export type RefreshTokenRevokedReason = "rotated" | "logout" | "replay_detected" | "user_missing";

export class UserRefreshToken extends Model<
  InferAttributes<UserRefreshToken>,
  InferCreationAttributes<UserRefreshToken>
> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<number>;
  declare familyId: string;
  declare tokenHash: string;
  declare expiresAt: Date;
  declare revokedAt: CreationOptional<Date | null>;
  declare revokedReason: CreationOptional<RefreshTokenRevokedReason | null>;
  declare replacedByTokenHash: CreationOptional<string | null>;
  declare userAgent: CreationOptional<string | null>;
  declare ipAddress: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function defineUserRefreshTokenModel(sequelize: Sequelize, UserModel: typeof User) {
  UserRefreshToken.init(
    {
      id: {
        type: DataTypes.INTEGER,
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
      },
      familyId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: "同一次登录派生出的 token 家族标识；重放检测命中时按家族整体撤销",
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
      revokedReason: {
        type: DataTypes.STRING(40),
        allowNull: true,
        comment: "撤销原因：rotated / logout / replay_detected / user_missing",
      },
      replacedByTokenHash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: "轮换后的 refresh token 摘要，用于排查复用",
      },
      userAgent: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      ipAddress: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: "UserRefreshToken", tableName: "UserRefreshTokens" },
  );

  UserRefreshToken.belongsTo(UserModel, {
    foreignKey: "userId",
    as: "user",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });

  return UserRefreshToken;
}
