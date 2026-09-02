/**
 * 文件职责：定义 Users 模型。
 * Users 保存登录账号、密码哈希和 /api/me 常用头像字段。
 */
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from "sequelize";

import type { UserProfile } from "./user-profile.model.js";

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare username: string;
  declare password: string;
  declare role: CreationOptional<string>;
  declare avatar: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  /** include({ as: "userProfile" }) 时填充；不是数据库列，故标记 NonAttribute。 */
  declare userProfile?: NonAttribute<UserProfile>;
}

export function defineUserModel(sequelize: Sequelize) {
  User.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        comment: "用户名, 唯一登录标识",
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: "密码",
      },
      role: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "user",
        comment: "账号角色：user / admin。admin 才能写公开内容",
      },
      avatar: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "头像 URL（本站经 POST /api/uploads/profiles 为 /uploads/profiles/...）",
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, modelName: "User", tableName: "Users" },
  );

  return User;
}
