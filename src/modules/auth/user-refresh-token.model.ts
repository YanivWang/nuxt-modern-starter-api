import { DataTypes, type Model, type ModelStatic, type Sequelize } from "sequelize";

export function defineUserRefreshTokenModel(sequelize: Sequelize, User: ModelStatic<Model>) {
  const UserRefreshToken = sequelize.define("UserRefreshToken", {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Users.id，refresh token 所属用户",
      references: {
        model: "Users",
        key: "id",
      },
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
  });

  UserRefreshToken.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });

  return UserRefreshToken;
}
