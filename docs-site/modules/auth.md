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
    TokenBlacklist Port：声明 access token jti 黑名单需要的 add/has 能力

  ports/login-attempt-tracker.port.ts
    LoginAttemptTracker Port：声明登录失败计数与账号锁定能力

  index.ts
    模块公开入口：createAuthModule() 组装 verifier、中间件、service、controller 和 router

  jwt-verify.service.ts
    JWT 解析、过期校验、黑名单校验

  authCookie.ts
    access/refresh/csrf Cookie 读写与 CSRF 比较

  user-refresh-token.model.ts
    UserRefreshToken Sequelize 模型
```

模型文件位于认证模块内，通过 `src/db/models.ts` 统一注册。`createAuthModule(database, blacklist, loginAttempts, authRateLimit)` 显式接收数据库、`TokenBlacklist` Port、`LoginAttemptTracker` Port 和认证限流中间件；对应的 Redis 实现位于 `src/infrastructure/auth/`。

## 认证接口

默认接口：

- `POST /api/v1/register`
- `POST /api/v1/login`
- `POST /api/v1/refresh`
- `POST /api/v1/logout`

注册、登录、刷新都挂了认证限流中间件，用于降低暴力破解和刷 token 风险。该中间件由组合根注入，计数存储走 Redis，因此阈值在多实例部署下仍然准确。

仅按 IP 限流拦不住换 IP 的分布式撞库，因此登录还叠加了**账号级失败锁定**：同一用户名连续失败达到 `LOGIN_MAX_FAILED_ATTEMPTS`（默认 10）后锁定 `LOGIN_LOCKOUT_SECONDS`（默认 15 分钟），返回 429。计数存在 Redis 中，每次失败都会刷新 TTL，使持续攻击持续延长锁定。未配置 `REDIS_URL` 时该能力降级为不锁定。

登出接口先经过认证中间件，因为登出需要知道当前 access token 的 `jti` 才能写入 Redis 黑名单。它使用的是**允许 token 过期**的变体：签名仍必须有效，但过期不再阻止登出。

## 注册流程

```text
POST /api/v1/register
  -> authRateLimitMiddleware
  -> validate(registerSchema)
  -> register controller
  -> authService.register()
  -> bcrypt.hash(password, BCRYPT_ROUNDS)
  -> User.create({ username, password: hashPwd })
  -> success("注册成功")
```

注册只创建用户，不自动登录。用户注册后需要再调用 `/api/v1/login` 获取 token。

用户名唯一性由数据库唯一约束保证。如果重复注册，Sequelize 会抛出 `UniqueConstraintError`，`auth.service.ts` 捕获后转成 `CONFLICT` 业务错误，最终返回 `409 用户名已存在`。（未被业务捕获的唯一键冲突会走 `errorMiddleware` 的兜底分支，返回通用的 `409 资源已存在`。）

## 登录流程

```text
POST /api/v1/login
  -> authRateLimitMiddleware
  -> validate(loginSchema)
  -> login controller
  -> authService.login()
  -> User.findOne({ username })
  -> bcrypt.compare(password, user.password)
  -> authSessionService.createTokenPair()
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
- `familyId`（同一次登录派生出的 token 家族）
- `tokenHash`
- `expiresAt`
- `revokedAt`
- `revokedReason`（`rotated` / `logout` / `replay_detected` / `user_missing`）
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
POST /api/v1/refresh
  -> validate(refreshSchema)
  -> 从 body 或 Cookie 读取 refreshToken
  -> 如果 refreshToken 来自 Cookie，校验 CSRF
  -> authSessionService.rotate()
  -> 创建新 refresh token 记录
  -> 撤销旧 refresh token
  -> 签发新 access token
  -> 重新写 Cookie
  -> 返回新 token pair
```

为什么请求体 refreshToken 不要求 CSRF？

因为显式把 refreshToken 放在 body 的客户端，通常是 Bearer 类客户端或非浏览器自动 Cookie 场景，不会被浏览器跨站自动附带。Cookie 来源会被浏览器自动携带，所以需要 CSRF 防护。

## refresh token 轮换

`auth-session.service.ts` 中 `rotate()` 的核心顺序（全部在一个事务内，旧会话使用 `SELECT ... FOR UPDATE` 行锁）：

1. 按摘要查找会话（**不过滤 `revokedAt`**，否则无法区分「不存在」与「已被使用过」）。
2. 已撤销 → 判定为重放，交由事务外的家族撤销处理（见下一节）。
3. 已过期 → 拒绝。
4. 查找用户是否仍存在。
5. 生成新 refresh token，**继承旧会话的 `familyId`**。
6. 写入新 token 摘要。
7. 更新旧会话的 `revokedAt`、`revokedReason = "rotated"` 和 `replacedByTokenHash`。
8. 返回新的 access token 和 refresh token。

## refresh token 重放检测

一次登录派生出的所有轮换 token 共享一个 `familyId`（`UserRefreshTokens.familyId`）。`/api/v1/refresh` 按摘要取会话时**不过滤 `revokedAt`**，因为需要区分两种情况：

- 查不到记录 → token 不存在，直接 401。
- 查到但已撤销 → 该 token 曾被正常使用过，现在又被提交了一次，说明它已经泄露。

第二种情况下只拒绝本次请求是不够的：攻击者与真实用户在竞争同一条轮换链，先到者已经换走了新 token，被拒绝的往往是受害者，而攻击者手上的凭证依然有效。因此服务端会撤销**整个家族**，双方都被强制重新登录。这是 OAuth 2.0 Security BCP 对 refresh token 泄露的标准应对。

`revokedReason` 记录撤销原因（`rotated` / `logout` / `replay_detected` / `user_missing`），`replay_detected` 会同时打出 `refresh_token_replay_detected` 告警日志，可用于安全监控。

> 实现细节：家族撤销必须在**事务之外**单独提交。拒绝请求要靠抛错，而在 Sequelize 事务回调里抛错会回滚整个事务——撤销写入会被一并撤回，攻击者的 token 反而毫发无损。

## 密码策略

注册要求密码至少 8 位；登录侧**不**套用这个下限，只要求非空。提高注册强度不应把已经存在的短密码用户挡在门外——那等于一次静默的账号封禁。

两侧都拒绝超过 72 字节的密码：bcrypt 只取前 72 字节，超出部分会被静默截断，两个前 72 字节相同的长密码会互相等价。

bcrypt 代价因子由 `BCRYPT_ROUNDS` 控制（默认 12，允许 10～15）。测试环境在 `.env.test` 中设为 10，避免测试为哈希强度买单。

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
POST /api/v1/logout
  -> authMiddleware（allowExpired: true）
  -> validate(logoutSchema)
  -> 从 req.user 读取 jti 和 exp
  -> 计算 access token 剩余 TTL（已过期则跳过黑名单）
  -> blacklist.add(jti, ttlSeconds)
  -> authSessionService.revoke(refreshToken)  // 撤销整个家族
  -> clearAuthCookies()
  -> success("退出登录成功")
```

登出会做两件事：

1. access token 写入 Redis 黑名单，让当前 JWT 立刻失效。
2. refresh token 在数据库中撤销，阻止继续换新 token。

如果 Redis 黑名单功能关闭，access token 无法主动失效，只能等自然过期。

两点与直觉不同的设计：

- 登出接受**已过期但签名有效**的 access token。登录态过期后用户依然要能主动撤销会话，否则「怀疑账号被盗、赶紧登出」这个最需要登出的场景反而无法完成。
- 登出撤销该 refresh token 所属的**整个家族**，而不只是当前这一条，使这台设备的会话链整体失效。

## 强制登录和可选登录

### authMiddleware

用于必须登录的接口，例如：

- `/api/v1/me`
- `/api/v1/me/profile`
- `/api/v1/projects`
- `/api/v1/documents/:documentId`
- `/api/v1/uploads`
- `/api/v1/uploads/large/*`
- `POST/PATCH/DELETE /api/v1/content/news`（新闻写操作）

（业务接口只在 `/api/v1` 下提供；无版本的 `/api` 别名已下线，访问会得到 404。）

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

- 查看当前登录设备列表（按 `familyId` 分组即为「一台设备的一次登录」）。
- 撤销指定 `familyId`，即下线单台设备。
- 撤销某用户所有 refresh token。
- refresh token 异常复用告警。
