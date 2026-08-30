/**
 * 文件职责：定义 UserProfiles 模型和 Users 一对一关联。
 * 扩展资料按 userId 唯一；头像仅存 Users.avatar，读取时通过 user 关联合并。
 */
import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from "sequelize";

import type { User } from "./user.model.js";

export class UserProfile extends Model<InferAttributes<UserProfile>, InferCreationAttributes<UserProfile>> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<number>;
  declare nickname: CreationOptional<string | null>;
  declare gender: CreationOptional<string | null>;
  declare birthday: CreationOptional<string | null>;
  declare bio: CreationOptional<string | null>;
  declare address: CreationOptional<string | null>;
  declare company: CreationOptional<string | null>;
  declare jobTitle: CreationOptional<string | null>;
  declare isMarried: CreationOptional<boolean | null>;
  declare mom: CreationOptional<string | null>;
  declare father: CreationOptional<string | null>;
  declare university: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  /** include({ as: "user" }) 时填充。 */
  declare user?: NonAttribute<User>;
}

export function defineUserProfileModel(sequelize: Sequelize, UserModel: typeof User) {
  UserProfile.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
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
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: "UserProfile",
      tableName: "UserProfiles",
      indexes: [{ unique: true, name: "user_profiles_user_id_unique", fields: ["userId"] }],
    },
  );

  UserProfile.belongsTo(UserModel, { foreignKey: "userId", onDelete: "CASCADE", as: "user" });
  UserModel.hasOne(UserProfile, { foreignKey: "userId", as: "userProfile" });

  return UserProfile;
}
