import { defineUserProfileModel } from "./user-profile.model.js";
import { defineUserModel } from "./user.model.js";

import type { Sequelize } from "sequelize";

export function initModels(sequelize: Sequelize) {
  const User = defineUserModel(sequelize);
  const UserProfile = defineUserProfileModel(sequelize, User);

  return { User, UserProfile };
}
