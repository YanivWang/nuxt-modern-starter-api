# 配置、数据库与 Redis

本页解释项目的启动配置、数据库连接、迁移策略和 Redis 设计。

## 环境变量加载规则

配置入口是 `src/env.ts`。

加载顺序：

```text
外部 process.env
  优先级最高，不会被文件覆盖

.env.{APP_ENV}
  例如 .env.development / .env.test / .env.production

.env.{APP_ENV}.local
  本机覆盖文件，适合放不提交的本地配置
```

`APP_ENV` 优先，其次 `NODE_ENV`，默认 `development`。

允许的环境：

- `development`
- `test`
- `production`

如果同时设置 `APP_ENV` 和 `NODE_ENV`，二者必须一致。这样可以避免“读取开发配置，但按生产模式运行”的隐患。

## 环境变量模板

项目提供：

- `.env.example`：开发环境模板。
- `.env.production.example`：生产环境模板。
- `.env.test`：测试环境默认值。

实际开发通常执行：

```bash
cp .env.example .env.development
```

生产部署通常执行：

```bash
cp .env.production.example .env.production
```

生产环境必须替换 `replace_with`、`change_me` 这类占位值，否则 `src/env.ts` 会拒绝启动。

## 核心配置分类

### 服务与日志

| 变量          | 说明                               |
| ------------- | ---------------------------------- |
| `APP_ENV`     | 应用环境，用于选择配置文件         |
| `NODE_ENV`    | Node/依赖库运行模式                |
| `PORT`        | API 监听端口，默认 3000            |
| `LOG_LEVEL`   | 日志级别，默认 info                |
| `LOG_TO_FILE` | 是否写入 logs 目录，生产默认 false |

### CORS 与代理

| 变量                 | 说明                           |
| -------------------- | ------------------------------ |
| `CORS_ORIGINS`       | 逗号分隔的浏览器跨域来源白名单 |
| `TRUST_PROXY`        | Express trust proxy 配置       |
| `REQUEST_BODY_LIMIT` | JSON/urlencoded 请求体大小限制 |

开发环境示例（与 `nuxt-modern-starter` 联调）：

```env
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173
```

- `http://localhost:3000`：Nuxt 前端开发地址。
- `http://localhost:5173`：VitePress 文档站本地预览地址。

修改 `.env.development` 后，Docker 开发环境需要 `--force-recreate api` 才会重新加载 CORS 配置。

部署在 Nginx 或负载均衡后面时，通常需要 `TRUST_PROXY=1`，否则 `req.ip` 和限流客户端识别会退化为代理 IP。

### 限流

| 变量                        | 说明             |
| --------------------------- | ---------------- |
| `RATE_LIMIT_WINDOW_MS`      | 全局限流窗口     |
| `RATE_LIMIT_MAX`            | 全局限流次数     |
| `AUTH_RATE_LIMIT_WINDOW_MS` | 认证接口限流窗口 |
| `AUTH_RATE_LIMIT_MAX`       | 认证接口限流次数 |

生产默认全局限流更严格，开发环境默认更宽松。

### JWT 与 Cookie

| 变量                        | 说明                         |
| --------------------------- | ---------------------------- |
| `JWT_SECRET`                | JWT 签名密钥，至少 32 字符   |
| `ACCESS_TOKEN_TTL_SECONDS`  | access token 有效期          |
| `REFRESH_TOKEN_TTL_SECONDS` | refresh token 有效期         |
| `AUTH_COOKIE_SECURE`        | Cookie 是否只在 HTTPS 下发送 |

生产环境 `AUTH_COOKIE_SECURE` 默认 `true`。

### Redis

| 变量                           | 说明                |
| ------------------------------ | ------------------- |
| `AUTH_TOKEN_BLACKLIST_ENABLED` | 是否启用 JWT 黑名单 |
| `REDIS_URL`                    | Redis 连接 URL      |
| `REDIS_PASSWORD`               | Docker Redis 密码   |

如果关闭黑名单，`REDIS_URL` 可以为空。

### MySQL

| 变量                  | 说明                   |
| --------------------- | ---------------------- |
| `DB_HOST`             | MySQL 主机             |
| `DB_PORT`             | MySQL 端口             |
| `DB_NAME`             | 数据库名               |
| `DB_USER`             | 应用数据库用户         |
| `DB_PWD`              | 应用数据库密码         |
| `MYSQL_ROOT_PASSWORD` | Docker MySQL root 密码 |

## 配置校验策略

`src/env.ts` 会在启动时 fail fast：

- 缺少必需变量直接退出。
- 端口必须在 `1~65535`。
- 正整数配置必须大于 0。
- 布尔值只接受明确格式，例如 `true/false/1/0/yes/no/on/off`。
- `JWT_SECRET` 长度至少 32 字符。
- `JWT_SECRET` 不能是常见弱默认值。
- 生产环境不能使用占位值。

这让配置错误尽早暴露，而不是服务启动后在请求中随机失败。

## Sequelize 连接

`src/db.ts` 创建 Sequelize 实例：

```text
new Sequelize(DB_NAME, DB_USER, DB_PWD, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: "mysql"
})
```

测试环境关闭 Sequelize SQL logging，避免测试输出过多。

模型注册：

```text
initModels(sequelize)
  -> defineUserModel()
  -> defineUserProfileModel()
  -> defineUserRefreshTokenModel()
  -> defineWorkspaceModel()
  -> defineProjectModel()
  -> defineDocumentModel()
```

然后导出：

- `sequelize`
- `User`
- `UserProfile`
- `UserRefreshToken`
- `Workspace`
- `Project`
- `Document`

## 迁移策略

迁移工具是 Umzug。

迁移文件：

```text
src/migrations/*.ts
```

迁移上下文是 Sequelize QueryInterface。

开发/测试环境：

- `connectDatabase()` 会自动运行 pending migrations。
- 这样本地和测试启动成本更低。

生产环境：

- `connectDatabase()` 只验证连接。
- 不自动改表。
- 部署前必须显式运行迁移。

生产迁移命令：

```bash
pnpm build
pnpm db:migrate:prod
```

## 当前表结构

### Users

保存账号和基础展示字段。

关键约束：

- `username` 唯一。
- `password` 必填。
- `avatar` 可空。

### UserProfiles

保存扩展资料。

关键约束：

- `userId` 指向 `Users.id`。
- `userId` 唯一。
- 删除用户时级联删除资料。

### UserRefreshTokens

保存 refresh token 会话。

关键约束：

- `tokenHash` 唯一。
- `userId` 有索引。
- `expiresAt` 有索引。
- 删除用户时级联删除 token 会话。

### Workspaces

保存用户拥有的工作区。当前每个用户有一个 `type = personal` 的默认空间。

### Projects

保存 PPT 项目元数据，关联到工作区与用户。

### Documents

保存编辑器文档内容，与项目一对一关联。

## Redis 生命周期

`src/redis.ts` 根据 `AUTH_TOKEN_BLACKLIST_ENABLED` 创建客户端：

```text
true
  -> createClient({ url: REDIS_URL })
  -> connect()
  -> ping()

false
  -> redis = null
  -> connectRedis() 只写 warning，不连接
```

关闭 Redis 时：

```text
disconnectRedis()
  -> redis.quit()
```

## Redis 当前只做什么

只做 JWT 黑名单。

key 格式：

```text
jwt:blacklist:<jti>
```

value：

```text
1
```

TTL：

```text
access token 剩余有效期
```

这样黑名单 key 会自动过期，不会永久增长。

## Redis 不做什么

当前 Redis 不负责：

- 通用业务缓存。
- session 存储。
- 分布式锁。
- 大文件上传状态。
- 限流存储。

如果未来要扩展这些能力，建议先抽象新的 service，不要直接把所有 Redis 操作塞进 `redis.ts`。

## /ready 就绪检查

`/ready` 会检查：

- MySQL：`sequelize.authenticate()`
- Redis：如果启用，则 `redis.ping()`

返回示例：

```json
{
  "status": "ready",
  "checks": {
    "mysql": "ok",
    "redis": "ok"
  }
}
```

如果关闭黑名单：

```json
{
  "status": "ready",
  "checks": {
    "mysql": "ok",
    "redis": "disabled"
  }
}
```

依赖不可用时返回 503。
