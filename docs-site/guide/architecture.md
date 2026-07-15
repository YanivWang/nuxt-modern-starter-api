# 整体架构

本项目采用“启动入口 + Express 装配 + 横切中间件 + 业务模块 + 基础设施”的结构。目标是让每一层只承担自己的职责。

## 逻辑分层

```text
src/server.ts
  负责进程启动、依赖连接、HTTP 监听、优雅关闭

src/app.ts
  负责 Express app 装配：安全、中间件、静态资源、探针、Swagger、路由、错误处理

src/middlewares/
  负责横切能力：认证、校验、错误、限流、日志、requestId、压缩

src/modules/
  auth/
    注册、登录、accessToken/refreshToken、Cookie、CSRF、登出
  user/
    当前用户、用户扩展资料
  content/
    公开新闻与定价页内容（内存数据源 + 可选 Nuxt revalidate）
  upload/
    普通图片上传、大文件分片上传、秒传索引
  workspace/
    默认个人空间、项目 CRUD（列表/创建/详情/更新/删除）
  document/
    编辑器文档读取与保存

src/db/ / src/redis.ts / src/env.ts
  负责配置、数据库、模型注册、迁移和 Redis 等基础设施

src/openapi.ts / src/swagger.ts
  负责接口文档生成与 Swagger UI

tests/
  unit/
    不依赖外部服务的单元测试
  integration/
    依赖 MySQL/Redis 的 API 集成测试
```

## 进程启动链路

入口是 `src/server.ts`。

启动顺序：

1. 导入 `src/app.ts`，创建 Express 应用。
2. `connectDatabase()` 验证 MySQL 连接。
3. 非生产环境自动执行 pending migrations。
4. `connectRedis()` 按配置连接 Redis；如果关闭黑名单，则跳过连接。
5. `ensureUploadsRoot()` 确保 `uploads/` 目录存在。
6. `app.listen(PORT)` 开始监听端口。
7. 注册 `SIGTERM` 和 `SIGINT`，用于优雅关闭。

优雅关闭顺序：

1. 停止 HTTP server 接收新请求。
2. 关闭 Sequelize 连接。
3. 关闭 Redis 连接。
4. 10 秒超时兜底，避免容器停止卡死。

## Express 装配顺序

`src/app.ts` 中间件顺序很重要：

```text
helmet / Swagger CSP 例外
  -> cors
  -> requestId
  -> http request log
  -> /uploads 静态资源
  -> /health /ready
  -> global rate limit
  -> compression
  -> json/urlencoded body parser
  -> Swagger
  -> /api auth/content/user/workspace/document/upload
  -> 404
  -> errorMiddleware
```

`src/app.ts` 中业务路由挂载顺序为：`auth` → `content` → `user` → `workspace` → `document` → `upload`。

几个关键点：

- `/uploads` 是公开静态资源，不挂登录态中间件。
- `/health` 和 `/ready` 放在全局限流前，避免探针被业务流量影响。
- body parser 放在上传路由之前不会处理 multipart，multipart 由 multer 处理。
- Swagger UI 需要放宽 CSP，因此对 `/api-docs` 使用独立 helmet 配置。
- `/uploads` 需要被前端跨域加载，因此对该路径将 CORP 设为 `cross-origin`。
- 所有未匹配路由最终进入 404，再由统一错误中间件输出 `{ code, message, data }`。

## 模块内部结构

业务模块一般按这个方向流动：

```text
*.routes.ts
  -> validate(schema)
  -> authMiddleware / optionalAuthMiddleware
  -> asyncHandler(controller)
  -> *.controller.ts
  -> *.service.ts
  -> db / redis / utils
```

各文件职责：

- `routes`：声明 URL、HTTP 方法、中间件顺序。
- `schema`：声明 Zod 校验规则。
- `controller`：处理 HTTP 层逻辑，如读取 `req.user`、`req.validated`、设置 Cookie、返回响应。
- `service`：处理业务规则和数据读写。
- `model`：声明 Sequelize 模型与关联。

这个结构避免 controller 直接塞满数据库逻辑，也避免 service 依赖 Express 的请求/响应对象。

## 目录组织约定

新增业务能力默认进入 `src/modules/<domain>/`。一个可维护模块至少应把 HTTP 路由、请求校验、控制器、业务服务和数据模型分清楚：

```text
src/modules/<domain>/
  <domain>.routes.ts
  <domain>.controller.ts
  <domain>.service.ts
  <domain>.schema.ts
  <domain>.model.ts
```

不属于单个业务领域的能力再进入共享目录：

- `src/middlewares/`：Express 横切中间件，例如认证、限流、错误处理、请求日志。
- `src/utils/`：不依赖具体业务领域的工具函数。
- `src/types/`：跨模块共享的类型扩展。
- `src/db/`：数据库连接、模型注册、迁移器和迁移文件。

数据库模型的边界略有特殊：模型定义仍在所属业务模块内，例如 `src/modules/user/user.model.ts`、`src/modules/workspace/project.model.ts`；`src/db/models.ts` 只负责按依赖顺序统一初始化这些模型和关联，`src/db/index.ts` 再统一导出 Sequelize 实例和模型对象。

测试不进入 `src/`，统一放在顶层 `tests/`。`tests/unit/` 承载不依赖外部服务的单元测试，`tests/integration/` 承载依赖 MySQL/Redis 的 API 集成测试。这样 `src/` 始终保持运行时代码视野，测试作为外部消费者验证模块和 HTTP 行为。

企业级 SaaS 的后续领域扩展也遵守 `src/modules/<domain>/` 规则，但不提前空建目录。只有当真实业务落地时，才新增例如：

```text
src/modules/organization/
src/modules/member/
src/modules/audit/
src/modules/billing/
```

其中 `organization` / `member` 适合承载组织、成员和协作关系，`audit` 适合承载操作审计，`billing` 适合承载套餐、订阅、用量和支付回调。

构建产物和运行时数据不进入源码结构讨论，也不应提交：

```text
dist/
logs/
uploads/
.data/
docs-site/.vitepress/dist/
```

## 基础设施边界

### 环境变量

`src/env.ts` 是配置入口。它负责：

- 根据 `APP_ENV` 或 `NODE_ENV` 加载 `.env.{APP_ENV}`。
- 再加载 `.env.{APP_ENV}.local`。
- 外部注入的环境变量优先级最高，不会被文件覆盖。
- 校验 JWT、DB、Redis、CORS、限流、Cookie 等配置。
- 生产环境拒绝常见占位值。

### 数据库

`src/db/index.ts` 创建 Sequelize 实例，并调用 `src/db/models.ts` 注册模型。非生产环境自动执行迁移，生产环境只验证连接。

### Redis

`src/redis.ts` 当前只服务于 JWT 黑名单。它不是缓存抽象层，也没有承载业务缓存。

### 迁移

`src/db/migrator.ts` 配置 Umzug，迁移文件在 `src/db/migrations/`。`src/migrate.ts` 提供命令行入口。

迁移文件直接使用 `createTable` / `addIndex` 建表，不做 `tableExists` 条件判断。若本地 schema 与迁移不一致，使用 `pnpm db:drop-create` 或重建数据库后再迁移。

## 数据模型关系

```text
Users
  id
  username
  password
  avatar

UserProfiles
  id
  userId -> Users.id
  nickname
  gender
  birthday
  ...

UserRefreshTokens
  id
  userId -> Users.id
  tokenHash
  expiresAt
  revokedAt
  replacedByTokenHash
  userAgent
  ipAddress

Workspaces
  id
  ownerId -> Users.id
  name
  type

Projects
  id
  workspaceId -> Workspaces.id
  ownerId -> Users.id
  title
  description
  status
  slideCount
  accent

Documents
  id
  projectId -> Projects.id
  ownerId -> Users.id
  title
  content
```

关系：

- `Users` 与 `UserProfiles` 是一对一。
- `Users` 与 `UserRefreshTokens` 是一对多。
- `Users` 与 `Workspaces` 是一对多；当前每个用户有一个 `type = personal` 的默认空间，且 `(ownerId, type)` 唯一。
- `Workspaces` 与 `Projects` 是一对多。
- `Projects` 与 `Documents` 是一对一。
- 删除用户时，关联资料、refresh token、空间、项目和文档会级联删除。

头像仅存 `Users.avatar`：

- `/api/me` 与 `/api/me/profile` 均通过 `Users.avatar` 返回头像。
- `PATCH /api/me/profile` 的 `avatar` 字段写入 `Users.avatar`。

## 文档架构

项目有两类文档：

- VitePress 文档站：解释架构、模块、部署和维护方式。
- OpenAPI 文档：解释 HTTP 接口的请求参数和响应结构。

OpenAPI 由 `src/openapi.ts` 生成，`docs/openapi.yaml` 是生成物。修改接口后，应更新源码中的 Zod schema 和 OpenAPI 定义，再运行 `pnpm openapi:generate`。

## 当前架构适用边界

这个脚手架适合：

- 单体 Express API 服务。
- 普通 Web App 后端。
- 登录态、用户资料、公开营销内容、工作台项目、编辑器文档、文件上传类需求。
- 单实例或小规模部署。
- 后续按业务裁剪或扩展。

需要额外设计的场景：

- 多租户权限模型。
- RBAC/菜单权限/权限点系统。
- 多实例大文件上传。
- 对象存储 multipart 上传。
- 分布式锁。
- 高并发业务缓存。
- 复杂队列和异步任务系统。
