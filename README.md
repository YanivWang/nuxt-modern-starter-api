# Express Modern Starter

独立 Express API 服务脚手架，基于参考项目 `apps/backend/rest-api` 提炼，保留通用 Web App 后端能力：auth、user、health、Swagger、MySQL、可选 Redis、JWT、文件上传和 Docker 部署。

## 快速开始

```bash
pnpm install
cp .env.example .env.development
pnpm dev
```

常用命令：

```bash
pnpm build
pnpm test
pnpm run check
pnpm openapi:generate
pnpm db:migrate
pnpm db:migrate:pending
pnpm db:drop-create
pnpm docker:dev
pnpm docker:prod
```

Swagger: `http://localhost:3000/api-docs`，OpenAPI: `http://localhost:3000/openapi.yaml`。

## OpenAPI 文档

OpenAPI 由 `src/openapi.ts` 统一生成，运行时 Swagger 和 `docs/openapi.yaml` 都来自同一份定义；请求体 schema 直接复用现有 Zod 校验规则，避免接口校验和文档分叉。

```bash
pnpm openapi:generate # 重新生成 docs/openapi.yaml
pnpm openapi:check    # 校验 docs/openapi.yaml 是否与源码同步
```

`pnpm run check` 已包含 `openapi:check`。新增或修改接口时，请同步更新 `src/openapi.ts`，再运行 `pnpm openapi:generate`。

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

本地运行前请确保测试库和 Redis 可用；CI 已在 `.github/workflows/ci.yml` 中配置 MySQL/Redis services。

只验证不依赖外部服务的逻辑时，可以运行：

```bash
pnpm test:unit
```

只运行 API 集成测试时，可以运行 `pnpm test:integration`。

## Web App 授权约定

这个脚手架面向纯 Web App API，不默认引入后台管理系统常见的 RBAC、菜单权限或权限点模型。默认约定是：

- `authMiddleware` 负责确认“当前请求是谁”，适合 `/api/me`、上传、订单等必须登录的接口。
- `optionalAuthMiddleware` 适合“登录用户和匿名用户都能访问，但返回内容略有差异”的接口。
- 资源归属校验放在 service 层，例如只能修改自己的资料、只能删除自己的上传任务、只能查看自己的订单。
- 如果业务后续出现管理员后台、多角色协作或租户权限，再按业务引入 role/permission，不作为前台 Web App starter 的默认复杂度。

## 生产部署

1. 准备生产环境变量：

```bash
cp .env.production.example .env.production
```

务必替换 `JWT_SECRET`、`DB_PWD`、`MYSQL_ROOT_PASSWORD`、`REDIS_PASSWORD` 等占位值；生产启动时会拒绝 `replace_with` / `change_me` 这类模板值。
生产环境建议显式配置 `CORS_ORIGINS`、`TRUST_PROXY`、`RATE_LIMIT_MAX`、`AUTH_RATE_LIMIT_MAX`，并根据真实流量调整限流窗口。
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

### 部署约定

- 生产镜像使用多阶段构建，运行阶段只包含 `dist`、生产依赖和 `docs/openapi.yaml`。
- 生产日志默认输出到 stdout/stderr，便于容器平台采集；如需同时写入 `logs/`，设置 `LOG_TO_FILE=true`。
- `uploads` 和 `.data` 在生产 Compose 中使用 volume 持久化；多实例部署前需重新设计上传存储和大文件上传会话存储。
- 如需使用国内或企业 npm registry 构建镜像，可在 `.env.production` 设置 `NPM_REGISTRY=https://registry.npmmirror.com`。
- 应用会处理 `SIGTERM` / `SIGINT`，关闭 HTTP server、MySQL 与启用状态下的 Redis 连接后退出。

## 裁剪指南

如果业务不需要 Redis，优先设置 `AUTH_TOKEN_BLACKLIST_ENABLED=false` 并移除 `REDIS_URL`。应用会跳过 Redis 连接，`/ready` 会把 Redis 标记为 `disabled`，`logout` 不再写入黑名单，JWT 校验也不再检查黑名单。这样做意味着已签发 JWT 在过期前无法被服务端主动失效。

如果你要彻底删除 Redis 依赖，再移除 `src/redis.ts`、`src/services/auth-token.service.ts` 的 Redis 调用、Docker Compose 中的 Redis service，以及相关环境变量。

如果业务不需要普通文件上传，可以移除 `src/routes/upload.routes.ts` 中 `/uploads`、`/uploads/profiles` 相关路由，以及 `src/controllers/upload.controller.ts`、`src/config/upload.config.ts` 和 `/uploads` 静态目录挂载。

如果业务不需要大文件分片上传，可以移除 `src/controllers/large-upload.controller.ts`、`src/services/large-upload.service.ts`、`src/config/large-upload.multer.ts`、`src/schema/large-upload.schema.ts`、`src/constants/largeUpload.ts` 以及 `upload.routes.ts` 中 `/uploads/large/*` 路由。

当前上传实现使用本地磁盘和 `.data` 会话文件，适合单实例部署。多实例或容器弹性伸缩场景请改为对象存储（S3、OSS、MinIO 等），并把大文件上传会话迁移到 Redis、数据库或对象存储 multipart 机制。
