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
