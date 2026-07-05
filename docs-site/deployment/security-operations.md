# 安全与运维要点

本页整理项目中已经具备的安全设计，以及上线运维时必须注意的边界。

## 启动期安全

`src/env.ts` 在启动时校验关键配置。

生产环境会拒绝：

- 太短的 `JWT_SECRET`
- 常见弱密钥
- `replace_with`
- `change_me`
- 空数据库密码
- 缺失 CORS 白名单
- 缺失必需 Redis 配置，除非明确关闭黑名单

这能避免使用模板配置直接上线。

## 密钥要求

必须替换：

- `JWT_SECRET`
- `DB_PWD`
- `MYSQL_ROOT_PASSWORD`
- `REDIS_PASSWORD`

建议：

- 使用随机生成的高强度字符串。
- 不要提交真实 `.env.production`。
- 通过部署平台 secret 管理环境变量。
- 定期轮换生产密钥和密码。

## CORS

生产环境必须显式配置：

```text
CORS_ORIGINS=https://app.example.com
```

不要在生产使用任意来源。

本地与 Nuxt 前端联调时，开发环境应包含前端 origin，例如：

```env
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

如果前端与 API 网关端口不同，浏览器请求仍来自 Nuxt 的 `http://localhost:3000`，而不是 API 的 `http://localhost:2026`。

如果前端和 API 跨站且使用 Cookie：

- 服务端 `credentials: true` 已启用。
- 前端请求需要 `credentials: "include"`。
- Cookie Secure 需要 HTTPS。
- SameSite 策略要结合真实域名和跳转流程评估。

## Cookie 安全

认证 Cookie：

- `access_token`：httpOnly
- `refresh_token`：httpOnly
- `csrf_token`：非 httpOnly

httpOnly 能降低 XSS 直接读取 token 的风险，但不能阻止浏览器自动带 Cookie 发请求，所以写操作还需要 CSRF。

生产默认：

```text
AUTH_COOKIE_SECURE=true
```

必须通过 HTTPS 访问，否则浏览器不会发送 Secure Cookie。

## CSRF

Cookie 认证的非安全方法必须带：

```http
X-CSRF-Token: <csrf_token cookie value>
```

服务端使用常量时间比较。

Bearer 认证不需要 CSRF，因为攻击站点无法让浏览器自动附带 Authorization header。

## JWT 黑名单

JWT access token 是无状态凭证。默认情况下，服务无法主动让已经签发的 JWT 失效。

本项目通过 Redis 黑名单解决登出立即失效：

```text
jwt:blacklist:<jti>
```

TTL 等于 access token 剩余寿命。

如果设置：

```text
AUTH_TOKEN_BLACKLIST_ENABLED=false
```

那么：

- 服务可不连接 Redis。
- 登出不会写黑名单。
- access token 会一直有效到过期。
- refresh token 仍会被数据库撤销。

关闭前必须确认业务接受这个风险。

## refresh token 安全

refresh token 只保存 SHA-256 摘要。

每次 refresh 都轮换 token：

- 新 token 入库。
- 旧 token 撤销。
- 旧 token 记录替代 token 摘要。

如果旧 token 被重放，会因为已撤销而失败。

## 密码安全

用户密码使用 bcrypt 哈希：

```text
bcrypt.hash(password, 10)
```

数据库中保存的是哈希，不保存明文。

不要在日志中打印 password、token、Cookie 或完整 Authorization header。

## 错误信息暴露边界

项目区分两类错误：

- `createHttpError()`：业务错误，可暴露给客户端。
- `createInternalServerError()` 或未知异常：只返回统一 500 文案，细节写日志。

这样客户端能看到必要业务提示，但不会拿到内部堆栈和数据库错误。

## 日志

开发环境默认写：

- `logs/error.log`
- `logs/combined.log`
- 控制台彩色输出

生产环境默认：

- stdout/stderr JSON 日志
- `LOG_TO_FILE=false`

容器部署建议由平台采集 stdout/stderr，不建议在容器内依赖本地日志文件。

## 健康检查

`/health`：

- 只证明进程存活。
- 不访问数据库。

`/ready`：

- 检查 MySQL。
- 如果启用 Redis，检查 Redis。
- Redis 关闭时返回 `disabled`。
- 依赖失败返回 503。

部署平台可以用：

- `/health` 做存活探针。
- `/ready` 做就绪探针。

## 数据库迁移

生产环境不会在 API 启动时自动执行迁移。

部署流程应包含：

```bash
pnpm build
pnpm db:migrate:prod
pnpm docker:prod
```

不要在生产使用：

```bash
pnpm db:drop-create
```

也不要使用 `sequelize.sync()` 管理生产表结构。

## 上传文件运维

当前上传文件落在：

```text
uploads/
```

大文件会话和索引落在：

```text
.data/
```

生产 Compose 已把它们配置为 volume。

运维注意：

- 备份 `uploads` 和 `.data`。
- 不要把它们作为镜像内容。
- 多实例前必须改共享存储。
- 大文件临时目录需要考虑清理策略。

## Nginx 与代理

Nginx 会转发：

- `Host`
- `X-Real-IP`
- `X-Forwarded-For`
- `X-Forwarded-Proto`

应用需要：

```text
TRUST_PROXY=1
```

否则：

- `req.ip` 可能是代理 IP。
- 限流可能按代理 IP 聚合。
- 日志中的客户端 IP 不准确。

## 上线前检查清单

上线前至少确认：

- `JWT_SECRET` 已替换为强随机值。
- `DB_PWD`、`MYSQL_ROOT_PASSWORD`、`REDIS_PASSWORD` 已替换。
- `CORS_ORIGINS` 是真实前端域名。
- `AUTH_COOKIE_SECURE=true` 且启用 HTTPS。
- `AUTH_TOKEN_BLACKLIST_ENABLED` 的取值符合业务风险。
- 生产迁移已执行。
- `/health` 返回 200。
- `/ready` 返回 200。
- `uploads` 和 `.data` 有持久化。
- 日志可被平台采集。
- `pnpm run check` 在 CI 通过。
