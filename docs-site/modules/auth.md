# 认证模块

认证模块位于 `src/modules/auth/`，负责注册、登录、刷新登录态、登出、JWT 校验、Cookie 与 CSRF。

## 文件职责

```text
src/modules/auth/
  auth.routes.ts
    路由注册：/register、/login、/refresh、/logout

  auth.schema.ts
    Zod 校验：用户名密码、refreshToken、logout body

  auth.controller.ts
    HTTP 层：读取校验结果、设置 Cookie、处理 CSRF、调用 service

  auth.service.ts
    注册和登录业务：接收 Zod 校验后的用户名密码，bcrypt 哈希与比对

  auth-session.service.ts
    access token 签发、refresh token 生成/落库/轮换/撤销

  ports/token-blacklist.port.ts
  index.ts
    Redis JWT jti 黑名单

  jwt-verify.service.ts
    JWT 解析、过期校验、黑名单校验

  authCookie.ts
    access/refresh/csrf Cookie 读写与 CSRF 比较

  user-refresh-token.model.ts
    UserRefreshToken Sequelize 模型
```

模型文件位于认证模块内，通过 `src/db/models.ts` 统一注册。`createAuthModule(database, blacklist)` 显式接收数据库和 `TokenBlacklist` Port；Redis 实现位于 `src/infrastructure/auth/redis-token-blacklist.ts`。

## 认证接口

默认接口：

- `POST /api/register`
- `POST /api/login`
- `POST /api/refresh`
- `POST /api/logout`

注册、登录、刷新都挂了 `authRateLimitMiddleware`，用于降低暴力破解和刷 token 风险。

登出接口必须先通过 `authMiddleware`，因为登出需要知道当前 access token 的 `jti`，才能写入 Redis 黑名单。

## 注册流程

```text
POST /api/register
  -> authRateLimitMiddleware
  -> validate(registerSchema)
  -> register controller
  -> registerUser()
  -> bcrypt.hash(password, 10)
  -> User.create({ username, password: hashPwd })
  -> success("注册成功")
```

注册只创建用户，不自动登录。用户注册后需要再调用 `/api/login` 获取 token。

用户名唯一性由数据库唯一约束保证。如果重复注册，Sequelize 会抛出 `UniqueConstraintError`，统一错误中间件返回 `409 用户名已存在`。

## 登录流程

```text
POST /api/login
  -> authRateLimitMiddleware
  -> validate(loginSchema)
  -> login controller
  -> loginUser()
  -> User.findOne({ username })
  -> bcrypt.compare(password, user.password)
  -> createAuthTokenPair()
  -> setAuthCookies()
  -> response body 返回 accessToken/refreshToken
```

登录成功后，服务同时支持两种客户端接入方式：

1. 响应体返回 `accessToken`，客户端用 `Authorization: Bearer <accessToken>`。
2. 服务端写入 httpOnly Cookie，浏览器 Web App 可走 Cookie 登录态。

登录/刷新成功时，响应 `data` 固定包含：

```json
{
  "accessToken": "<JWT>",
  "refreshToken": "<明文 refresh token>",
  "accessTokenExpiresIn": 900,
  "refreshTokenExpiresIn": 2592000
}
```

**不存在** `token` 或其它 access token 字段别名；客户端统一读取 `accessToken`。

## access token

access token 是 JWT，短期有效。

payload 包含：

- `id`
- `username`
- `jti`
- `exp`
- `iat`

`jti` 是 JWT ID，用于登出黑名单。如果 token 缺少 `jti`，项目会视为无效 token。

access token 的过期时间来自：

```text
ACCESS_TOKEN_TTL_SECONDS
```

默认是 15 分钟。

## refresh token

refresh token 是长期凭证，默认有效期 30 天。

关键安全设计：

- 明文 refresh token 只返回给客户端。
- 数据库只保存 SHA-256 摘要。
- 每次刷新都会轮换 refresh token。
- 旧 refresh token 会立即撤销。

表：`UserRefreshTokens`

核心字段：

- `userId`
- `tokenHash`
- `expiresAt`
- `revokedAt`
- `replacedByTokenHash`
- `userAgent`
- `ipAddress`

`userAgent` 和 `ipAddress` 主要用于审计和排查。

## 刷新登录态

刷新接口支持两种 token 来源：

1. 请求体里的 `refreshToken`
2. `refresh_token` Cookie

流程：

```text
POST /api/refresh
  -> validate(refreshSchema)
  -> 从 body 或 Cookie 读取 refreshToken
  -> 如果 refreshToken 来自 Cookie，校验 CSRF
  -> rotateRefreshToken()
  -> 创建新 refresh token 记录
  -> 撤销旧 refresh token
  -> 签发新 access token
  -> 重新写 Cookie
  -> 返回新 token pair
```

为什么请求体 refreshToken 不要求 CSRF？

因为显式把 refreshToken 放在 body 的客户端，通常是 Bearer 类客户端或非浏览器自动 Cookie 场景，不会被浏览器跨站自动附带。Cookie 来源会被浏览器自动携带，所以需要 CSRF 防护。

## refresh token 轮换

`rotateRefreshToken()` 的核心顺序：

1. 查找旧 refresh token 摘要。
2. 确认未撤销且未过期。
3. 查找用户是否仍存在。
4. 生成新 refresh token。
5. 写入新 token 摘要。
6. 更新旧会话的 `revokedAt` 和 `replacedByTokenHash`。
7. 返回新的 access token 和 refresh token。

如果旧 refresh token 被重复使用，会因为 `revokedAt` 已存在而失败。

## Cookie 设计

登录和刷新成功时写入：

| Cookie          | httpOnly | 用途                              |
| --------------- | -------- | --------------------------------- |
| `access_token`  | 是       | 浏览器 Cookie 登录态的 access JWT |
| `refresh_token` | 是       | 浏览器 Cookie 登录态的 refresh    |
| `csrf_token`    | 否       | 前端读取后写入 `X-CSRF-Token`     |

Cookie 默认：

- `sameSite: "lax"`
- `path: "/"`
- `secure` 由 `AUTH_COOKIE_SECURE` 控制

生产默认 `AUTH_COOKIE_SECURE=true`，本地开发默认 `false`。

## CSRF 规则

Cookie 认证的非安全方法必须携带：

```http
X-CSRF-Token: <csrf_token cookie value>
```

服务端使用 `timingSafeEqual` 比较 Cookie 和 Header，避免比较进度泄露。

Bearer 认证不需要 CSRF，因为浏览器不会自动把 Authorization header 附带到跨站请求中。

## 登出流程

```text
POST /api/logout
  -> authMiddleware
  -> validate(logoutSchema)
  -> 从 req.user 读取 jti 和 exp
  -> 计算 access token 剩余 TTL
  -> blacklistJwt(jti, ttlSeconds)
  -> revokeRefreshToken(refreshToken)
  -> clearAuthCookies()
  -> success("退出登录成功")
```

登出会做两件事：

1. access token 写入 Redis 黑名单，让当前 JWT 立刻失效。
2. refresh token 在数据库中撤销，阻止继续换新 token。

如果 Redis 黑名单功能关闭，access token 无法主动失效，只能等自然过期。

## 强制登录和可选登录

### authMiddleware

用于必须登录的接口，例如：

- `/api/me`
- `/api/me/profile`
- `/api/projects`
- `/api/documents/:documentId`
- `/api/uploads`
- `/api/uploads/large/*`
- `POST/PATCH/DELETE /api/content/news`（新闻写操作）

它会：

- 读取 Bearer 或 Cookie access token。
- 校验 JWT。
- 校验 Redis 黑名单。
- Cookie 非安全方法校验 CSRF。
- 成功后写入 `req.user`。

### optionalAuthMiddleware

用于“登录用户和匿名用户都能访问”的接口。

当前项目提供中间件，但没有默认示例路由。公开新闻/定价的**读**接口直接匿名访问，不经过该中间件；后续比如“登录用户看到额外字段”的公开页可以使用它。

## 常见扩展方式

### 增加邮箱登录

建议：

1. 扩展 `Users` 表，增加 `email` 唯一字段。
2. 修改注册 schema。
3. 修改 `auth.service.ts` 的查询逻辑。
4. 同步 OpenAPI。
5. 增加重复邮箱测试。

### 增加 RBAC

当前脚手架没有默认角色/权限模型。只有业务真实出现后台、多角色协作或租户权限时，再增加：

- `Roles`
- `Permissions`
- `UserRoles`
- 权限检查中间件

不要过早把简单 Web App starter 做复杂。

### 支持多端会话管理

当前 refresh token 已记录 userAgent 和 ipAddress。后续可以扩展：

- 查看当前登录设备列表。
- 撤销指定 refresh token。
- 撤销某用户所有 refresh token。
- refresh token 异常复用告警。
