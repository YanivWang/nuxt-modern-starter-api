# 用户模块

用户模块位于 `src/modules/user/`，负责当前用户信息和用户扩展资料。

## 文件职责

```text
src/modules/user/
  user.routes.ts
    注册 /api/me 与 /api/me/profile 路由

  user.schema.ts
    /api/me 的 Zod schema

  user.controller.ts
    当前用户 HTTP 控制器

  user.service.ts
    查询对外展示的用户基础资料

  user.model.ts
    Users Sequelize 模型

  user-profile.schema.ts
    用户扩展资料 Zod schema

  user-profile.service.ts
    扩展资料清洗、校验、upsert、头像双写

  user-profile.model.ts
    UserProfiles Sequelize 模型与 Users 一对一关联
```

## 对外接口

当前用户模块提供：

- `GET /api/me`
- `GET /api/me/profile`
- `PATCH /api/me/profile`

所有接口都必须登录，因此都会先经过 `authMiddleware`。

## 数据模型

### Users

`Users` 保存登录账号和常用展示字段。

核心字段：

- `id`
- `username`
- `password`
- `avatar`
- `createdAt`
- `updatedAt`

`password` 保存 bcrypt 哈希，不保存明文。

`avatar` 是 `/api/me` 返回的头像字段。

### UserProfiles

`UserProfiles` 保存扩展资料。

核心字段：

- `userId`
- `nickname`
- `avatar`
- `gender`
- `birthday`
- `bio`
- `address`
- `company`
- `jobTitle`
- `isMarried`
- `mom`
- `father`
- `university`

`userId` 有唯一索引，一个用户最多一条扩展资料。

## Users 与 UserProfiles 的关系

```text
Users.id
  1 ───── 1
UserProfiles.userId
```

模型关联在 `user-profile.model.ts` 中声明：

- `UserProfile.belongsTo(User)`
- `User.hasOne(UserProfile)`

删除用户时，对应资料会级联删除。

## /api/me

`GET /api/me` 用于获取当前登录用户的基础信息。

返回字段：

- `id`
- `username`
- `avatar`
- `nickname`

注意：虽然 nickname 来自 `UserProfiles`，但头像来自 `Users.avatar`。

查询流程：

```text
GET /api/me
  -> authMiddleware
  -> validate(getMeSchema)
  -> getMe controller
  -> findPublicProfileById(uid)
  -> User.findByPk(id, include UserProfile.nickname)
  -> 组装 PublicUserProfile
```

如果 JWT 仍有效，但数据库中的用户已经不存在，会返回 `401 用户不存在或登录已失效，请重新登录`。

## /api/me/profile

`GET /api/me/profile` 用于读取当前用户扩展资料。

如果用户还没有资料记录，返回：

```json
{
  "code": 200,
  "message": "获取用户扩展资料成功",
  "data": {
    "profile": null
  }
}
```

这表示“用户存在，但未填写资料”，不是错误。

## 更新资料

`PATCH /api/me/profile` 支持局部更新。

请求体只允许白名单字段，并且至少提供一个字段。schema 使用 `.strict()`，多传字段会被拒绝。

示例：

```json
{
  "nickname": "小明",
  "gender": "unknown",
  "bio": "喜欢写 TypeScript",
  "avatar": "/uploads/profiles/2026/07/avatar.webp"
}
```

## 字段清洗规则

`user-profile.service.ts` 会做业务层清洗和校验：

- 字符串字段会 trim。
- 空字符串会转为 `null`。
- `nickname` 最大 100 字符。
- `avatar` 最大 500 字符。
- `gender` 只能是 `male`、`female`、`unknown`。
- `birthday` 必须是 `YYYY-MM-DD`。
- `bio` 最大 65535 字符。
- `address/company/jobTitle/mom/father/university` 最大 255 字符。

为什么 schema 之后还要 service 校验？

Zod schema 负责请求结构和基础类型；service 负责业务规则和数据库写入前的最终清洗。这样即使未来有非 HTTP 调用 service，也不会绕过业务规则。

## upsert 逻辑

更新资料使用事务：

```text
sequelize.transaction
  -> UserProfile.findOne({ lock: UPDATE })
  -> 如果不存在：UserProfile.create()
  -> 如果存在：row.update()
  -> 如果 avatar 被更新：同步 User.update({ avatar })
```

`lock: Transaction.LOCK.UPDATE` 用于避免同一用户资料并发写入时出现竞争。

## 头像双写

项目同时保存：

- `Users.avatar`
- `UserProfiles.avatar`

这是一个有意设计。

原因：

- `/api/me` 是常用接口，需要快速返回基础资料，头像从 `Users.avatar` 读取。
- `/api/me/profile` 是资料详情接口，头像从 `UserProfiles.avatar` 读取。
- 用户修改头像时，两处必须保持一致。

所以 `upsertUserProfileForUser()` 在事务里同步更新 `Users.avatar`。

## 对外展示不返回 password

`user.service.ts` 中的 `PublicUserProfile` 明确不包含 `password`。

controller 返回用户信息时只返回安全字段：

- `id`
- `username`
- `avatar`
- `nickname`

这是避免敏感字段泄露的基本边界。

## 常见扩展方式

### 增加手机号

如果手机号用于登录，建议放在 `Users`。

如果手机号只是资料展示，建议放在 `UserProfiles`。

### 增加公开用户页

可以新增：

```text
GET /api/users/:id
```

建议复用 `findPublicProfileById()`，但要注意只返回公开字段。

### 用户资料审核

如果资料需要审核，不建议直接覆盖当前资料。可以增加：

- `UserProfileDrafts`
- `reviewStatus`
- `reviewedAt`
- `reviewedBy`

避免审核中的内容影响线上展示。
