/**
 * 文件职责：定义 UserProfiles 模型和 Users 一对一关联。
 * 扩展资料按 userId 唯一；头像仅存 Users.avatar，读取时通过 user 关联合并。
 */
import { DataTypes, type Model, type ModelStatic, type Sequelize } from "sequelize";

export function defineUserProfileModel(sequelize: Sequelize, User: ModelStatic<Model>) {
  const UserProfile = sequelize.define(
    "UserProfile",
    {
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Users.id，一对一",
      },
      nickname: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      gender: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: "male / female / unknown",
      },
      birthday: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      bio: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      address: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      company: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      jobTitle: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      isMarried: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
      },
      mom: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      father: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      university: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
    },
    {
      tableName: "UserProfiles",
      indexes: [{ unique: true, name: "user_profiles_user_id_unique", fields: ["userId"] }],
    },
  );

  UserProfile.belongsTo(User, { foreignKey: "userId", onDelete: "CASCADE", as: "user" });
  User.hasOne(UserProfile, { foreignKey: "userId", as: "userProfile" });

  return UserProfile;
}
