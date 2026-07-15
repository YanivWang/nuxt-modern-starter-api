/**
 * 文件职责：集中初始化 Sequelize 模型。
 * 统一在这里建立模型定义和关联，db.ts 只负责连接与导出模型实例。
 */
import { defineUserProfileModel } from "../modules/user/user-profile.model.js";
import { defineUserRefreshTokenModel } from "../modules/auth/user-refresh-token.model.js";
import { defineUserModel } from "../modules/user/user.model.js";
import { defineDocumentModel } from "../modules/document/document.model.js";
import { defineProjectModel } from "../modules/workspace/project.model.js";
import { defineWorkspaceModel } from "../modules/workspace/workspace.model.js";

import type { Sequelize } from "sequelize";

export function initModels(sequelize: Sequelize) {
  const User = defineUserModel(sequelize);
  // 关联在各模型定义函数内部完成；初始化顺序要先有 User，再挂依赖 User 的 profile/token/workspace 等模型。
  const UserProfile = defineUserProfileModel(sequelize, User);
  const UserRefreshToken = defineUserRefreshTokenModel(sequelize, User);
  const Workspace = defineWorkspaceModel(sequelize, User);
  const Project = defineProjectModel(sequelize, User, Workspace);
  const Document = defineDocumentModel(sequelize, User, Project);

  return { User, UserProfile, UserRefreshToken, Workspace, Project, Document };
}
