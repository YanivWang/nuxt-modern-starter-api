/**
 * 文件职责：集中初始化 Sequelize 模型。
 * 统一在这里建立模型定义和关联，db.ts 只负责连接与导出模型实例。
 */
import { defineUserProfileModel } from "../modules/user/user-profile.model.js";
import { defineUserRefreshTokenModel } from "../modules/auth/user-refresh-token.model.js";
import { defineUserModel } from "../modules/user/user.model.js";

import type { Sequelize } from "sequelize";

export function initModels(sequelize: Sequelize) {
  const User = defineUserModel(sequelize);
  const UserProfile = defineUserProfileModel(sequelize, User);
  const UserRefreshToken = defineUserRefreshTokenModel(sequelize, User);

  return { User, UserProfile, UserRefreshToken };
}
