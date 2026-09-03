# 安全与运维要点

本页整理项目中已经具备的安全设计，以及上线运维时必须注意的边界。

## 启动期安全

`src/env.ts` 在启动时校验关键配置。

所有环境都会在启动时直接退出的情况：

- `JWT_SECRET` 缺失，或长度不足 32 字符，或是常见弱默认值
- `DB_HOST` / `DB_USER` / `DB_PWD` / `DB_NAME` 缺失或为空
- 端口不在 `1~65535`，正整数配置不是正整数，布尔配置格式非法
- 启用黑名单（默认）时缺失 `REDIS_URL`
- 同时设置了 `APP_ENV` 与 `NODE_ENV` 但两者不一致
- `APP_ENV`/`NODE_ENV` 不是 `development` / `test` / `production` 之一

只在生产环境额外拒绝的情况：

- `JWT_SECRET` 或 `DB_PWD` 仍包含 `replace_with` / `change_me` 这类模板占位值

注意 `CORS_ORIGINS` 不属于启动期校验：生产环境未配置时服务照常启动，但 `getCorsOriginOption()` 返回 `false`，所有浏览器跨域请求都会被拒绝。

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

如果前端与 API 网关端口不同，浏览器请求仍来自 Nuxt 的 `http://localhost:3000`，而不是 API 的 `http://localhost:2027`。

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

项目使用与 HTTP 解耦的 `AppError`。业务层只声明 BAD_REQUEST、UNAUTHORIZED、FORBIDDEN、NOT_FOUND、CONFLICT、GONE、INTERNAL 分类；`errorMiddleware` 统一映射 HTTP 状态。INTERNAL 和未知异常只返回统一 500 文案，细节写日志。

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

迁移器位于 `src/db/migrator.ts`，生产构建后对应 `dist/db/migrator.js`；迁移文件来自 `src/db/migrations/` 编译后的 `dist/db/migrations/`。生产部署前应使用构建产物执行迁移，而不是依赖 API 启动时自动改表。

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

### `/uploads` 是无鉴权的静态出口，走独立限流预算

`uploads/` 整个目录由 `express.static` 挂在 `/uploads` 下：**任何人拿到 URL 都能下载，不需要登录**。
这对站内公开图片/视频是刻意的。

它挂在一档独立的限流上（`STATIC_RATE_LIMIT_*`，默认 15 分钟 3000 次），不与业务接口共享额度：

- 记在 API 账上会让图片多的页面把接口配额烧光，反过来 429 掉整个应用。
- 完全不限则是一条无需登录、可无限反复拉大文件的出口。

两件事仍需部署侧保证：

- 不要把任何私有内容写进 `uploads/`。服务端私有状态（分片、会话、秒传索引）一律放 `.data/`。
- 生产环境应由 Nginx/CDN 直接提供 `/uploads` 并在那一层做带宽与连接数限制，
  而不是把大文件下载压在 Node 进程上。应用内这一档是没有 CDN 时的底线，不是替代品。

### 内容写接口要求 admin 角色

`POST/PATCH/DELETE /api/v1/content/news` 挂的是 `auth` + `requireAdmin` 两层。
只校验「已登录」是不够的：这些接口改的是所有匿名访客都会看到的公开内容，
不是调用者自己的资源，只挂认证等于任何人注册一个账号就能删掉全站新闻。

角色存在 `Users.role`（`user` / `admin`，默认 `user`），**每次请求现查数据库**而不是从 JWT 读取：
token 里的角色在签发那一刻就固化了，撤销管理员之后他手上的 access token 仍然是管理员，
直到自然过期（默认 15 分钟）。授权判据必须能被立即撤销。

全新部署里没有任何管理员，写接口对所有人关闭。第一个管理员显式授予：

```bash
pnpm db:grant-admin <username>
```

```bash
pnpm db:grant-admin --list
```

收回：`pnpm db:grant-admin <username> --revoke`。

默认关闭而不是默认开放是有意的：反过来（升级后所有存量账号都是 admin，再逐个降权）
会在升级的那一瞬间把全站权限敞开。

## 公开内容与 revalidate

新闻/定价读接口公开；新闻写接口要求 `admin` 角色（见上一节的 `pnpm db:grant-admin`）。
新闻数据在 MySQL 表 `NewsArticles` 中；定价是随构建发布的静态常量，没有写接口。

若配置了：

```text
NUXT_REVALIDATE_URL
REVALIDATE_SECRET
```

新闻创建/更新/删除成功后会通知 Nuxt 清除相关 SWR 路径。未配置时写接口仍成功，只是跳过缓存失效。

生产环境若依赖该联动，需保证 API 能访问到 Nuxt revalidate 地址，且密钥与前端一致。

这两个变量必须真的传进 API 容器。它们没有默认值，缺失时 revalidator 直接跳过 ——
也就是说配错的表现不是报错，而是「缓存一直不刷新」这种要排查很久的静默失效。
`pnpm env:check` 会比对 `.env.production.example` 与生产 Compose 的 `api.environment`，
挡住这类「文档里有、容器里没有」的漂移。

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
- 若使用新闻 revalidate：`NUXT_REVALIDATE_URL` 可达，且 `REVALIDATE_SECRET` 与前端一致。
- `AUTH_COOKIE_SECURE=true` 且启用 HTTPS。
- `AUTH_TOKEN_BLACKLIST_ENABLED` 的取值符合业务风险。
- 生产迁移已执行。
- `/health` 返回 200。
- `/ready` 返回 200。
- `uploads` 和 `.data` 有持久化。
- 日志可被平台采集。
- `pnpm run check` 在 CI 通过。

## 可观测性

应用在 `/metrics` 暴露 Prometheus 文本格式指标：

| 指标                            | 类型      | 说明                                                             |
| ------------------------------- | --------- | ---------------------------------------------------------------- |
| `http_requests_total`           | Counter   | 按 `method` / `route` / `status_code` / `api_version` 统计请求数 |
| `http_request_duration_seconds` | Histogram | 请求耗时分布，覆盖 5ms～10s                                      |
| `nodejs_*` / `process_*`        | 多种      | prom-client 默认进程指标（内存、GC、事件循环延迟等）             |

`route` 标签使用路由模板（`/projects/:projectId`）而非真实 URL。用真实 URL 会让每个 uuid 生成一条独立时间序列，很快压垮 Prometheus；未匹配到路由的请求统一标记为 `unmatched`，避免扫描器用随机路径撑爆基数。

标签中**不含挂载前缀**：Express 在 router 执行结束后会还原 `req.baseUrl`，到 `res` 的 `finish` 事件时它已经是空字符串，拼接只会得到误导性的结果。版本信息改由独立的 `api_version` 标签承载，取值固定为 `v1` / `legacy` / `none`。

`api_version` 原本用于观察存量客户端的迁移进度。别名下线后它的含义变了：`legacy` 不再代表「尚未迁移」，而是「仍在打已下线路径」——正常应恒为 0，一旦非 0 就说明还有调用方停在旧前缀上，且它们拿到的是 404。

**`/metrics` 不经 Nginx 网关暴露**，只在 Compose 网络内可达，应由集群内 Prometheus 直接抓取。若确需对外暴露，请自行加认证或网络隔离——指标会泄露路由结构与流量特征。

建议的告警起点：

- 5xx 比例：`rate(http_requests_total{status_code=~"5.."}[5m])`
- 延迟劣化：`histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))`
- 认证异常：日志中的 `refresh_token_replay_detected` 与 `login_lockout_triggered`

## 后台清理任务

进程内置定时清理（间隔 `CLEANUP_INTERVAL_MS`，默认 6 小时），处理两类只增不减的数据：

- 过期或已撤销超过 `REFRESH_TOKEN_RETENTION_DAYS` 的 `UserRefreshTokens` 行。
- 超过 `UPLOAD_TEMP_RETENTION_HOURS` 的大文件上传临时分片与会话文件。客户端上传到一半掉线不会触发 abort，这些分片若无人清理会永久占用磁盘。

清理失败只记录日志、不影响在线请求，下一轮重试。定时器调用了 `unref()`，不会阻止进程优雅退出。

多实例部署时每个实例都会执行清理。清理操作本身幂等，但若希望严格单点执行，应改为外部定时任务（CronJob）调用。

## 进程级异常兜底

`src/server.ts` 注册了 `unhandledRejection` 与 `uncaughtException` 处理器。

Node 20+ 默认把未处理的 Promise rejection 视为致命错误。不接管的话，进程会直接终止，而且**连崩溃原因都不会被记录**——这正是此前一个畸形 Cookie 就能打掉实例、且日志里查不到任何线索的原因。

现在的行为是：先落结构化日志，`uncaughtException` 再走优雅退出，由编排平台重新拉起。异步中间件另外统一经 `asyncMiddleware` 包装，保证 reject 进入 `next(error)` 而不是逃逸到顶层。
