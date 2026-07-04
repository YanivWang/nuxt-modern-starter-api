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
      avatar: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "与 Users.avatar 双写；展示以 Users 为准",
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
