# Express Modern Starter

独立 Express API 服务脚手架，基于参考项目 `apps/backend/rest-api` 提炼，保留普通 Web App 后端常用能力：auth、user、health、Swagger、MySQL、可选 Redis、JWT access/refresh token、文件上传和 Docker 部署。

## 快速开始

本地 `pnpm dev` 只启动 Node API，不会自动启动 MySQL/Redis。首次运行前请先准备依赖服务：可以使用本机 MySQL/Redis，也可以先用 Docker Compose 启动开发依赖和容器内 API。

```bash
pnpm install
cp .env.example .env.development
# 确认 .env.development 中 DB_*、REDIS_URL 与实际 MySQL/Redis 一致
pnpm dev
```

如果希望直接用 Docker 启动开发环境：

```bash
cp .env.example .env.development
pnpm docker:dev
```

端口约定：

- 本机 `pnpm dev` 直连 API：`http://localhost:3000`
- Docker Nginx 网关：`http://localhost:2026`
- Docker 开发环境额外暴露 MySQL `3306`、Redis `6379` 和 Node 调试端口 `9229`

常用命令：

```bash
pnpm build
pnpm test
pnpm run check
pnpm openapi:generate
pnpm docs:dev
pnpm db:migrate
pnpm db:migrate:pending
pnpm db:drop-create
pnpm docker:dev
pnpm docker:prod
```

Swagger: `http://localhost:3000/api-docs`，OpenAPI: `http://localhost:3000/openapi.yaml`。

VitePress 架构文档位于 `docs-site/`，面向新人系统介绍项目架构、技术栈、功能模块、部署设计和运维边界：

```bash
pnpm docs:dev     # 本地阅读/编辑文档
pnpm docs:build   # 构建静态文档站
pnpm docs:preview # 预览构建产物
```

## 架构总览

请求入口是 `src/server.ts`：连接 MySQL、按配置连接 Redis、准备上传目录，然后启动 `src/app.ts` 组装出的 Express 应用。`src/app.ts` 负责横切中间件和路由挂载，业务代码按模块放在 `src/modules/`。

主要请求链路：

```text
server.ts
  -> connectDatabase() / connectRedis() / ensureUploadsRoot()
  -> app.ts
  -> helmet / cors / requestId / HTTP log
  -> /uploads 静态资源、/health /ready 探针
  -> rate limit / compression / body parser / Swagger
  -> /api auth / user / upload 路由
  -> 404 / errorMiddleware
```

目录职责：

| 路径                               | 职责                                                              |
| ---------------------------------- | ----------------------------------------------------------------- |
| `src/env.ts`                       | 加载 `.env.{APP_ENV}` 与 `.env.{APP_ENV}.local`，集中校验运行环境 |
| `src/db.ts`、`src/migrator.ts`     | Sequelize 连接、模型注册和 Umzug 迁移                             |
| `src/redis.ts`                     | JWT 黑名单 Redis 连接；关闭黑名单时可不启用 Redis                 |
| `src/middlewares/`                 | 统一错误、认证、限流、请求 ID、日志、Zod 校验等横切能力           |
| `src/modules/auth/`                | 注册、登录、access/refresh token、Cookie/CSRF、登出黑名单         |
| `src/modules/user/`                | `/api/me`、用户资料和头像字段同步                                 |
| `src/modules/upload/`              | 普通图片上传、头像上传、大文件分片上传和秒传索引                  |
| `src/openapi.ts`、`src/swagger.ts` | 运行时 Swagger 与 `docs/openapi.yaml` 的统一生成来源              |

辅助文件职责：

| 路径                          | 职责                                                                   |
| ----------------------------- | ---------------------------------------------------------------------- |
| `scripts/generate-openapi.ts` | 生成或校验 `docs/openapi.yaml`，CI 中通过 `openapi:check` 防止文档漂移 |
| `scripts/reset-db.ts`         | 开发/测试用数据库重建脚本，会 drop 当前库表后重新执行迁移              |
| `scripts/test-env.ts`         | 单独导入 `src/env.ts`，用于验证环境变量模板和启动期校验                |
| `docker/`                     | 生产/开发镜像、Compose 组合和 Nginx 网关配置                           |
| `.github/workflows/ci.yml`    | 运行 `pnpm run check` 的质量门禁，包含 MySQL 与 Redis services         |
| `vitest*.config.ts`           | 区分不依赖外部服务的单元测试与依赖 MySQL/Redis 的集成测试              |
| `eslint.config.js`            | TypeScript 类型感知 lint、Prettier 兼容和测试/脚本例外规则             |

注释维护约定：

- 可维护源码、脚本、Docker/Compose/Nginx/CI 和环境变量模板都带文件头，说明该文件的真实职责和边界。
- 关键代码注释只解释跨模块约定、安全边界、持久化格式、幂等/并发处理和容易误改的业务规则；不要给显而易见的赋值、调用或返回值堆注释。
- `package.json`、`tsconfig*.json`、`nodemon.json` 这类 JSON 文件不能写注释，职责在本 README 说明。
- `pnpm-lock.yaml`、`docs/openapi.yaml`、`dist/`、`logs/`、`uploads/`、`.data/` 属于锁文件、生成物或运行时数据，不应手写人工注释；修改接口后用 `pnpm openapi:generate` 重新生成 OpenAPI 文档。

响应格式统一为：

```json
{ "code": 200, "msg": "ok" }
```

错误响应同样使用 `{ "code": 4xx/5xx, "msg": "..." }`，业务字段会追加在同一层对象上。

## OpenAPI 文档

OpenAPI 由 `src/openapi.ts` 统一生成，运行时 Swagger 和 `docs/openapi.yaml` 都来自同一份定义；请求体 schema 直接复用现有 Zod 校验规则，统一成功/错误响应也在 OpenAPI components 中声明，避免接口校验和文档分叉。

```bash
pnpm openapi:generate # 重新生成 docs/openapi.yaml
pnpm openapi:check    # 校验 docs/openapi.yaml 是否与源码同步
```

`pnpm run check` 已包含 `openapi:check`。新增或修改接口时，请同步更新 `src/openapi.ts`，再运行 `pnpm openapi:generate`。

当前 OpenAPI security 只声明 Bearer JWT；Cookie + CSRF 的 Web App 接入细节以本 README 的“Web App 授权约定”为准。

## 数据库迁移

项目使用 Umzug 管理数据库结构，迁移文件位于 `src/migrations/`。

```bash
pnpm db:migrate          # 执行所有待执行迁移
pnpm db:migrate:pending  # 查看待执行迁移
pnpm db:migrate:executed # 查看已执行迁移
pnpm db:migrate:undo     # 回滚最后一个迁移
pnpm db:drop-create      # 仅开发使用：删除所有表后重新执行迁移
```

开发和测试环境启动时会自动执行 pending migrations；生产环境只验证数据库连接，部署前请显式运行迁移。生产镜像构建完成后也可以执行：

```bash
pnpm build
pnpm db:migrate:prod
```

不要在生产环境使用 `sequelize.sync()` 或 `db:drop-create` 管理表结构。

## 测试

`pnpm test` 会在 `APP_ENV=test` 下运行单元测试、API 集成测试和环境变量校验。完整 API 集成测试依赖 MySQL 与 Redis，默认读取 `.env.test`。

本地运行前请确保测试库和 Redis 可用；CI 已在 `.github/workflows/ci.yml` 中配置 MySQL/Redis services。注意 `.env.test` 默认 Redis 带密码，如果本地使用无密码 Redis，需要临时覆盖 `REDIS_URL` 或调整 `.env.test`。

只验证不依赖外部服务的逻辑时，可以运行：

```bash
pnpm test:unit
```

只运行 API 集成测试时，可以运行 `pnpm test:integration`。

## Web App 授权约定

这个脚手架面向纯 Web App API，不默认引入后台管理系统常见的 RBAC、菜单权限或权限点模型。默认约定是：

- `/api/login` 返回短期 `accessToken` 和长期 `refreshToken`，同时写入 `httpOnly` cookie，并写入非 `httpOnly` 的 `csrf_token`。响应里的 `token` 是 `accessToken` 的兼容别名。
- `/api/register` 只创建用户，不自动登录；注册成功后需要再调用 `/api/login` 获取 token。
- `/api/refresh` 使用 `refreshToken` 换取新的 `accessToken` 和 `refreshToken`，旧 refresh token 会立即失效。若 refresh token 来自 cookie，需带 `X-CSRF-Token` 请求头，值与 `csrf_token` cookie 一致。
- `authMiddleware` 优先读取 `Authorization: Bearer <accessToken>`，也支持浏览器请求携带的 `access_token` cookie，适合 `/api/me`、上传、订单等必须登录的接口。
- 使用 cookie 认证访问 POST/PATCH/PUT/DELETE 等非安全方法时，需带 `X-CSRF-Token` 请求头；Bearer 认证不受 CSRF 规则影响。
- `optionalAuthMiddleware` 适合“登录用户和匿名用户都能访问，但返回内容略有差异”的接口，支持 Bearer 和 `access_token` cookie；当前脚手架提供中间件但未默认挂载示例路由。
- 资源归属校验放在 service 层，例如只能修改自己的资料、只能删除自己的上传任务、只能查看自己的订单。
- 如果业务后续出现管理员后台、多角色协作或租户权限，再按业务引入 role/permission，不作为前台 Web App starter 的默认复杂度。

### Bearer 与 Cookie 怎么选

- 前端显式管理 token、移动端、小程序或第三方客户端：使用 `Authorization: Bearer <accessToken>`，并在 access token 过期后调用 `/api/refresh`。
- 同站点或同主域 Web App：可以使用服务端写入的 `httpOnly` cookie，降低 XSS 直接读取 token 的风险；前端需要读取 `csrf_token` cookie 并在非安全请求中放入 `X-CSRF-Token`。
- 生产环境 cookie 默认 `AUTH_COOKIE_SECURE=true`，本地开发默认 `false`。服务端 CORS 已启用 `credentials: true`，跨站 cookie 场景还需要前端请求设置 `credentials: "include"`，并按真实域名补充 SameSite 和 HTTPS 策略。

### 默认模块分层

| 层级         | 模块                                                                            | 建议                                                           |
| ------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 核心必留     | health/ready、env 校验、统一错误、requestId、日志、Zod 校验、OpenAPI、migration | 普通 Web App API 的基础设施，不建议删除                        |
| Web App 基础 | auth、access/refresh token、`/api/me`、用户资料                                 | 大多数需要登录态的 Web App 都会用到                            |
| 常用增强     | 普通图片上传、头像上传、Redis JWT 黑名单                                        | 需要用户资料图、登出立即失效时保留                             |
| 可选增强     | 大文件分片上传、秒传、本地 `.data` 会话                                         | 适合网盘、素材、视频等场景；普通内容站或 SaaS 表单应用可以删除 |

### 用户与资料模型

默认有三张核心业务表：`Users` 保存登录账号和 `/api/me` 常用字段，`UserProfiles` 保存扩展资料，`UserRefreshTokens` 保存 refresh token 会话。`Users` 与 `UserProfiles` 是一对一关系；资料接口更新 `avatar` 时会同步写入 `Users.avatar`，因为 `/api/me` 读取的是用户表头像，而 `/api/me/profile` 读取的是资料表头像。

### 大文件分片上传

大文件上传走 `init -> PUT chunk -> status -> merge` 流程：

- `POST /api/uploads/large/init` 提交 `fileName`、`fileSize`、`chunkSize`、`fileMd5`，如果全局 MD5 索引命中且文件仍存在，会直接秒传返回公开 URL。
- `PUT /api/uploads/large/:uploadId/chunks/:chunkIndex` 使用 multipart 字段 `chunk` 上传分片，并通过 `X-Chunk-Md5` 校验单片内容。
- `POST /api/uploads/large/:uploadId/merge` 合并所有分片，服务端会再次校验整文件 MD5 和大小。
- 上传会话和秒传索引保存在本地 `.data/`，最终文件落在 `uploads/large/` 并通过 `/uploads/...` 公开访问。

当前大文件上传是本地磁盘实现，适合单实例；多实例部署前应改为对象存储或把会话/锁迁移到共享基础设施。

## 生产部署

1. 准备生产环境变量：

```bash
cp .env.production.example .env.production
```

务必替换 `JWT_SECRET`、`DB_PWD`、`MYSQL_ROOT_PASSWORD`、`REDIS_PASSWORD` 等占位值；生产启动时会拒绝 `replace_with` / `change_me` 这类模板值。
生产环境建议显式配置 `CORS_ORIGINS`、`REQUEST_BODY_LIMIT`、`TRUST_PROXY`、`RATE_LIMIT_MAX`、`AUTH_RATE_LIMIT_MAX`、`ACCESS_TOKEN_TTL_SECONDS`、`REFRESH_TOKEN_TTL_SECONDS`、`AUTH_COOKIE_SECURE`，并根据真实流量调整请求体大小限制、限流窗口和登录态有效期。
默认 `AUTH_TOKEN_BLACKLIST_ENABLED=true`，服务会依赖 Redis 记录登出后的 JWT 黑名单。只有确认业务接受“已签发 JWT 在过期前无法主动失效”时，才建议改为 `false`。

2. 构建并执行数据库迁移：

```bash
pnpm build
pnpm db:migrate:prod
```

3. 启动 Docker Compose：

```bash
pnpm docker:prod
```

停止服务：

```bash
pnpm docker:prod:down
```

生产 Compose 会启动 MySQL、Redis、REST API 和 Nginx 网关。`rest-api` 暴露 `/health` 健康检查，网关会等待 API healthy 后再启动。应用还提供 `/ready`，用于检查 MySQL 和启用状态下的 Redis；当 `AUTH_TOKEN_BLACKLIST_ENABLED=false` 时，Redis 检查会标记为 `disabled`。
生产 Compose 默认只把 Nginx 网关映射到宿主机 `GATEWAY_HOST_PORT`（默认 `2026`），`rest-api` 的 3000 端口只在 Compose 网络内部使用。

### 部署约定

- 生产镜像使用多阶段构建，运行阶段只包含 `dist`、生产依赖和 `docs/openapi.yaml`。
- 生产日志默认输出到 stdout/stderr，便于容器平台采集；如需同时写入 `logs/`，设置 `LOG_TO_FILE=true`。
- `uploads` 和 `.data` 在生产 Compose 中使用 volume 持久化；多实例部署前需重新设计上传存储和大文件上传会话存储。
- 如需使用国内或企业 npm registry 构建镜像，可在 `.env.production` 设置 `NPM_REGISTRY=https://registry.npmmirror.com`。
- 应用会处理 `SIGTERM` / `SIGINT`，关闭 HTTP server、MySQL 与启用状态下的 Redis 连接后退出。

## 裁剪指南

如果业务不需要 Redis，优先设置 `AUTH_TOKEN_BLACKLIST_ENABLED=false` 并移除 `REDIS_URL`。应用会跳过 Redis 连接，`/ready` 会把 Redis 标记为 `disabled`，`logout` 不再写入黑名单，JWT 校验也不再检查黑名单。这样做意味着已签发 JWT 在过期前无法被服务端主动失效。

如果你要彻底删除 Redis 依赖，再移除 `src/redis.ts`、`src/modules/auth/auth-token.service.ts` 的 Redis 调用、Docker Compose 中的 Redis service，以及相关环境变量。

如果业务不需要普通文件上传，可以移除 `src/modules/upload/upload.routes.ts` 中 `/uploads`、`/uploads/profiles` 相关路由，以及 `src/modules/upload/upload.controller.ts`、`src/modules/upload/upload.config.ts` 和 `/uploads` 静态目录挂载。

如果业务不需要大文件分片上传，可以移除 `src/modules/upload/large-upload.controller.ts`、`src/modules/upload/large-upload.service.ts`、`src/modules/upload/large-upload.multer.ts`、`src/modules/upload/large-upload.schema.ts`、`src/modules/upload/largeUpload.ts` 以及 `src/modules/upload/upload.routes.ts` 中 `/uploads/large/*` 路由。

当前上传实现使用本地磁盘和 `.data` 会话文件，适合单实例部署。多实例或容器弹性伸缩场景请改为对象存储（S3、OSS、MinIO 等），并把大文件上传会话迁移到 Redis、数据库或对象存储 multipart 机制。
