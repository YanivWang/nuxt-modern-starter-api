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
    扩展资料 upsert、头像写入 Users.avatar

  user-profile.model.ts
    UserProfiles Sequelize 模型与 Users 一对一关联

  index.ts
    模块公开入口：createUserModule() 组装两个 service、controller 和 router
```

`user.model.ts` 和 `user-profile.model.ts` 只定义模型；实际初始化顺序由 `src/db/models.ts` 控制。`runtime.ts` 把 `AppDatabase` 注入 `createUserModule()`，Service 不再导入全局模型命名导出。

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

**不含 `avatar` 列**；头像仅存 `Users.avatar`，读取时通过关联 `User` 合并到响应。

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

## 字段校验规则

校验由 `user-profile.schema.ts` 中的 Zod schema 统一完成，service 只负责数据库写入与事务控制。

`nullableTrimmedString(label, max)` 辅助函数规则：

- `undefined`：字段未提供，PATCH 时跳过更新。
- `null`：清空字段。
- 非空字符串：trim 后保留；trim 后为空字符串也视为 `null`。

各字段约束：

| 字段                                                            | 规则                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| `nickname`                                                      | nullable trimmed string，max 100                      |
| `avatar`                                                        | nullable trimmed string，max 500；写入 `Users.avatar` |
| `gender`                                                        | `male` / `female` / `unknown` / null                  |
| `birthday`                                                      | `YYYY-MM-DD` / null                                   |
| `bio`                                                           | max 65535                                             |
| `address`、`company`、`jobTitle`、`mom`、`father`、`university` | max 255                                               |
| `isMarried`                                                     | boolean / null                                        |

schema 使用 `.strict()`，多传字段会被拒绝；至少提供一个字段才会通过校验。

## upsert 逻辑

更新资料使用事务：

```text
sequelize.transaction
  -> 若本次提交了 avatar：User.update({ avatar })
  -> 若本次提交了任意扩展资料字段：
       UserProfile.findOne({ lock: UPDATE })
       不存在 -> UserProfile.create()
       存在   -> row.update()
  -> 否则（本次只提交了 avatar）：UserProfile.findOrCreate({ userId })
```

事务提交后再查一次 `UserProfile`（带 `User` 关联）并返回；查不到视为内部错误。

`lock: Transaction.LOCK.UPDATE` 用于避免同一用户资料并发写入时出现竞争。

## 头像存储

头像仅存 `Users.avatar`：

- `/api/me` 直接读取 `Users.avatar`。
- `/api/me/profile` 通过 `UserProfile` 关联 `User` 合并返回 `avatar`。
- `PATCH /api/me/profile` 的 `avatar` 字段写入 `Users.avatar`。

## 对外展示不返回 password

`user.service.ts` 中的 `PublicUserProfile` 明确不包含 `password`。

controller 返回用户信息时只返回安全字段：

- `id`
- `username`
- `avatar`
- `nickname`

这是避免敏感字段泄露的基本边界。

## 测试现状

当前用户基础能力主要由 `tests/integration/auth.integration.test.ts` 间接覆盖：注册、登录后访问 `/api/me`、Bearer 与 Cookie 登录态都会验证不会返回 `password`。`/api/me/profile` 的 GET/PATCH 仍属于当前集成测试 gap，开发用户资料字段时应补充对应测试。

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
