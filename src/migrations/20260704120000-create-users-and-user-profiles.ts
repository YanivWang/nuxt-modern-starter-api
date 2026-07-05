/**
 * 文件职责：创建 Users 与 UserProfiles 表。
 */
import { DataTypes } from "sequelize";

import type { QueryInterface } from "sequelize";
import type { MigrationFn } from "umzug";

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.createTable("Users", {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
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
    avatar: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "头像 URL（本站经 POST /api/uploads/profiles 为 /uploads/profiles/...）",
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

  await context.createTable("UserProfiles", {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Users.id，一对一",
      references: {
        model: "Users",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
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
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  await context.addIndex("UserProfiles", ["userId"], {
    unique: true,
    name: "user_profiles_user_id_unique",
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.dropTable("UserProfiles");
  await context.dropTable("Users");
};
