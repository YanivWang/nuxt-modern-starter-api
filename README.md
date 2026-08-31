# Nuxt Modern Starter API

独立 Express API 服务脚手架，保留普通 Web App 后端常用能力：auth、user、content（公开新闻/定价）、workspace、document、health、metrics、Swagger、MySQL、Redis、JWT access/refresh token、文件上传、分片上传和 Docker 部署。

业务接口只在 `/api/v1` 前缀下提供。无版本的 `/api` 别名已下线，破坏性变更只通过抬版本号（`/api/v2`）发布。

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
- Docker Nginx 网关：`http://localhost:2027`
- Docker 开发环境额外暴露 MySQL `3306`、Redis `6379` 和 Node 调试端口 `9229`

与 `nuxt-modern-starter` 前端本地联调时，请保持以下配置一致：

- 前端 `.env.dev`：`NUXT_PUBLIC_API_BASE=http://localhost:2027/api`
- 后端 `.env.development`：`CORS_ORIGINS` 包含 `http://localhost:3000`
- 修改 `.env.development` 后需要重建 API 容器：`docker compose ... up -d --force-recreate api`

常用命令：

```bash
pnpm build
pnpm test
pnpm run check
pnpm architecture:check
pnpm openapi:generate
pnpm docs:dev
pnpm db:migrate
pnpm db:migrate:pending
pnpm db:drop-create
pnpm docker:dev
pnpm docker:prod
```

Swagger: `http://localhost:3000/api-docs` 或经 Docker 网关 `http://localhost:2027/api-docs`；OpenAPI 同理可通过 `/openapi.yaml` 访问。

VitePress 架构文档位于 `docs-site/`，面向新人系统介绍项目架构、技术栈、功能模块、部署设计和运维边界：

```bash
pnpm docs:dev     # 本地阅读/编辑文档
pnpm docs:build   # 构建静态文档站
pnpm docs:preview # 预览构建产物
```

## 架构总览

请求入口是 `src/server.ts`，唯一组合根是 `src/runtime.ts`。Runtime 显式创建数据库、Redis、内容仓储、缓存刷新和文件存储 Adapter，再把它们注入各业务模块工厂；`src/app.ts` 只负责横切中间件和已组装路由的 Express 装配。

主要请求链路：

```text
server.ts
  -> createRuntime()
  -> runtime.connect(): database / redis / fileStorage
  -> auth/content/user/workspace/document/upload 模块工厂
  -> createApp(dependencies)
  -> helmet / cors / requestId / metrics / HTTP log
  -> /uploads 静态资源、/health /ready 探针、/metrics 指标
  -> rate limit（Redis 共享计数）/ compression / body parser / Swagger
  -> /api/v1 auth / content / user / workspace / document / upload 路由
  -> 404 / errorMiddleware
```

目录职责：

| 路径                               | 职责                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `src/env.ts`                       | 加载 `.env.{APP_ENV}` 与 `.env.{APP_ENV}.local`，集中校验运行环境              |
| `src/db/`                          | Sequelize 连接、模型注册、Umzug 迁移器和迁移文件                               |
| `src/redis.ts`                     | JWT 黑名单 Redis 连接；关闭黑名单时可不启用 Redis                              |
| `src/runtime.ts`                   | 唯一组合根：创建 Adapter、组装模块并管理依赖生命周期                           |
| `src/infrastructure/`              | Redis、内存内容、Nuxt revalidate、本地文件、限流存储、指标、清理任务等 Adapter |
| `src/shared/http/`                 | 全站共用的 HTTP 契约，如分页入参约定与 `{ code, message, data }` 响应信封      |
| `src/shared/errors/`               | 与 HTTP 解耦的应用错误；状态码只在错误中间件映射                               |
| `src/middlewares/`                 | 统一错误、认证、限流、请求 ID、日志、Zod 校验等横切能力                        |
| `src/modules/auth/`                | 注册、登录、access/refresh token、Cookie/CSRF、登出黑名单                      |
| `src/modules/user/`                | `/api/me`、用户资料（头像仅存 `Users.avatar`）                                 |
| `src/modules/content/`             | 公开新闻/定价内容（内存数据源）；写操作可触发 Nuxt revalidate                  |
| `src/modules/upload/`              | 普通图片上传、头像上传、大文件分片上传和秒传索引                               |
| `src/modules/workspace/`           | 默认个人空间、项目 CRUD（列表/创建/详情/更新/删除）                            |
| `src/modules/document/`            | 编辑器文档读取与保存                                                           |
| `src/openapi.ts`、`src/swagger.ts` | 运行时 Swagger 与 `docs/openapi.yaml` 的统一生成来源                           |

当前源码目录结构：

```text
src/
  app.ts                    # 纯 Express 应用工厂
  runtime.ts                # 唯一依赖组合根
  server.ts                 # 进程启动、依赖连接、优雅关闭
  env.ts                    # 环境变量加载与 fail-fast 校验
  redis.ts                  # JWT 黑名单 Redis 客户端
  db/
    index.ts                # database 对象、Sequelize 生命周期与模型集合
    models.ts               # 模型初始化顺序与关联注册入口
    migrator.ts             # Umzug 迁移器
    migrations/             # 数据库迁移文件
  middlewares/              # auth、validate、error、rate limit、requestId、日志、压缩
  infrastructure/           # TokenBlacklist/ContentRepository/Revalidator/FileStorage Adapter
  modules/
    auth/                   # 注册、登录、refresh、logout、JWT/Cookie/CSRF
    user/                   # /api/me 与用户扩展资料
    content/                # 新闻/定价公开内容与 revalidate
    workspace/              # 默认个人空间与项目 CRUD
    document/               # 编辑器文档读取与保存
    upload/                 # 上传 HTTP/应用层与 FileStorage/LargeUploadStorage Ports
  shared/errors/            # AppError 与领域无关的错误分类
  routes/                   # /health 与 /ready
  types/                    # Express/JWT 共享类型扩展
  utils/                    # 响应、日志、校验读取与路径工具
```

辅助文件职责：

| 路径                                | 职责                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `scripts/generate-openapi.ts`       | 生成或校验 `docs/openapi.yaml`，CI 中通过 `openapi:check` 防止文档漂移 |
| `scripts/validate-architecture.mjs` | 强制模块不能依赖 infrastructure、HTTP middleware 或其他模块内部实现    |
| `scripts/reset-db.ts`               | 开发/测试用数据库重建脚本，会 drop 当前库表后重新执行迁移              |
| `scripts/test-env.ts`               | 单独导入 `src/env.ts`，用于验证环境变量模板和启动期校验                |
| `docker/`                           | 生产/开发镜像、Compose 组合和 Nginx 网关配置                           |
| `.github/workflows/ci.yml`          | 运行 `pnpm run check` 的质量门禁，包含 MySQL 与 Redis services         |
| `vitest*.config.ts`                 | 区分不依赖外部服务的单元测试与依赖 MySQL/Redis 的集成测试              |
| `eslint.config.js`                  | TypeScript 类型感知 lint、Prettier 兼容和测试/脚本例外规则             |

测试目录结构：

```text
tests/
  unit/
    openapi.test.ts
    env.redis.test.ts
    utils/http-helpers.test.ts
    infrastructure/revalidation.test.ts
    infrastructure/large-upload.internals.test.ts
    modules/auth.service.test.ts
    modules/auth-cookie.test.ts
    modules/auth-session.service.test.ts
    modules/jwt-verify.service.test.ts
    modules/content.service.test.ts
    modules/document.service.test.ts
    modules/user.service.test.ts
    modules/workspace.service.test.ts
  integration/
    auth.integration.test.ts
    content.integration.test.ts
    product-foundation.integration.test.ts
    response-contract.integration.test.ts
```

单元测试带覆盖率阈值（见 `vitest.config.ts`），已接入 `pnpm run check`。阈值只升不降：补测试后如果实测值明显高出，请顺手上调阈值，让它持续起到防回退作用。

目录维护约定：

- 新增业务能力默认放入 `src/modules/<domain>/`；每个模块通过 `index.ts` 暴露模块工厂，通过 `ports/` 和 `*.contract.ts` 暴露稳定契约，禁止跨模块导入内部 Service。
- `*.contract.ts` 是该模块响应形状的唯一来源：先写 Zod schema，再用 `z.infer` 推导 DTO 类型，mapper 显式标注这个返回类型。手写一份类型再手写一份文档 schema，两者迟早分叉，而分叉时没有任何一侧会报错。
- 跨模块引用 `*.model.ts` 只允许 `import type`。模型之间存在数据库外键关系，类型引用不可避免，但类型导入在编译后被擦除，不会建立运行时依赖；值导入仍会被 `architecture:check` 拒绝。
- Service 不依赖 Express middleware；业务错误使用 `src/shared/errors/app-error.ts`。只有 `src/runtime.ts` 可以选择并组装 `src/infrastructure/` 的具体 Adapter。
- 数据库模型仍由模块内的 `*.model.ts` 定义，通过 `src/db/models.ts` 统一注册；Service 由组合根注入 `AppDatabase`，不再导入全局模型命名导出。
- 测试统一放在顶层 `tests/`，`tests/unit/` 承载不依赖外部服务的单元测试，`tests/integration/` 承载依赖 MySQL/Redis 的 API 集成测试；`src/` 只保留运行时代码。
- 企业级 SaaS 后续扩展如 `organization`、`member`、`audit`、`billing` 仍按 `src/modules/<domain>/` 落地；没有真实业务前不空建目录。
- `dist/`、`logs/`、`uploads/`、`.data/`、`docs-site/.vitepress/dist/` 属于构建产物或运行时数据，只能由命令生成，不作为可维护源码提交。

注释维护约定：

- 可维护源码、脚本、Docker/Compose/Nginx/CI 和环境变量模板都带文件头，说明该文件的真实职责和边界。
- 关键代码注释只解释跨模块约定、安全边界、持久化格式、幂等/并发处理和容易误改的业务规则；不要给显而易见的赋值、调用或返回值堆注释。
- `package.json`、`tsconfig*.json`、`nodemon.json` 这类 JSON 文件不能写注释，职责在本 README 说明。
- `pnpm-lock.yaml`、`docs/openapi.yaml`、`dist/`、`logs/`、`uploads/`、`.data/` 属于锁文件、生成物或运行时数据，不应手写人工注释；修改接口后用 `pnpm openapi:generate` 重新生成、再用 `pnpm format` 归一化 OpenAPI 文档。

响应格式统一为：

```json
{ "code": 200, "message": "ok", "data": null }
```

带业务数据时，字段放在 `data` 内：

```json
{
  "code": 200,
  "message": "获取当前用户成功",
  "data": {
    "user": {
      "id": 1,
      "username": "demo"
    }
  }
}
```

错误响应同样使用 `{ "code", "message", "data": null }`，其中 `code` 是 HTTP 状态码（成功信封里的 `code` 恒为 200）。

每个端点在 OpenAPI 里声明的是它**真实会返回**的状态码，而不是统一的 400/429/500：需要鉴权的端点声明 401，按 id 取资源的端点声明 404（「存在但不属于当前用户」也映射为 404，不区分两者以免暴露他人资源是否存在），另有 403/409/410 按模块实际抛错点声明。取消分片上传是幂等的，因此刻意不声明 404。

`data` 的真实形状在 OpenAPI 里逐字段描述，不再是一个等价于「任意值」的空 schema。创建类接口（`POST /api/v1/projects`、`POST /api/v1/content/news`）的 HTTP status 是 201，信封里的 `code` 仍然是 200。

### 列表分页

所有列表接口使用统一的 `limit` / `offset` 约定（定义见 `src/shared/http/pagination.ts`），默认单页 20 条，上限 100。响应在 `data` 中附带分页元信息：

```json
{
  "code": 200,
  "message": "获取项目列表成功",
  "data": {
    "projects": [],
    "pagination": { "total": 42, "limit": 20, "offset": 0, "hasMore": true }
  }
}
```

## OpenAPI 文档

OpenAPI 由 `src/openapi.ts` 统一生成，运行时 Swagger 和 `docs/openapi.yaml` 都来自同一份定义。

请求体 schema 复用路由的 Zod 校验规则；响应 schema 复用各模块 `*.contract.ts` 里的响应契约——同一份 schema 又通过 `z.infer` 推导出 DTO 类型，因此「文档写的响应」和「mapper 真正返回的响应」在结构上不可能各说各话。

components 分两层：以 `Body` 结尾的是完整的 `{ code, message, data }` 信封（`code` 钉在字面量 200），不带后缀的是 `data` 里被多个响应共用的实体（`ProjectDto`、`Pagination` 等），只声明一次并由信封 `$ref` 引用。

`tests/integration/response-contract.integration.test.ts` 会用同一份 schema 解析真实 HTTP 响应体，补上类型系统够不到的一段：controller 拼信封时把 `{ project }` 写成 `{ projects }`、或顺手多返回一个字段，`tsc` 都不会报错。

```bash
pnpm openapi:generate # 重新生成 docs/openapi.yaml
pnpm format           # 生成物按 Prettier 规则归一化，否则 format:check 会失败
pnpm openapi:check    # 校验 docs/openapi.yaml 是否与源码同步
```

`pnpm run check` 已包含 `architecture:check` 与 `openapi:check`。新增或修改接口时，请同步更新 `src/openapi.ts`，再运行 `pnpm openapi:generate` 和 `pnpm format`。

当前 OpenAPI security 只声明 Bearer JWT；Cookie + CSRF 的 Web App 接入细节以本 README 的“Web App 授权约定”为准。

## 数据库迁移

项目使用 Umzug 管理数据库结构，迁移文件位于 `src/db/migrations/`。

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

迁移文件直接使用 `createTable` / `addIndex`，不含旧版幂等守卫。本地 schema 与代码不一致时，开发环境可 `pnpm db:drop-create` 或重建 Docker MySQL volume。

## 测试

`pnpm test` 会在 `APP_ENV=test` 下运行单元测试、API 集成测试和环境变量校验。完整 API 集成测试依赖 MySQL 与 Redis，默认读取 `.env.test`。

本地运行前请确保测试库和 Redis 可用；CI 已在 `.github/workflows/ci.yml` 中配置 MySQL/Redis services。注意 `.env.test` 默认 Redis 带密码，如果本地使用无密码 Redis，需要临时覆盖 `REDIS_URL` 或调整 `.env.test`。

只验证不依赖外部服务的逻辑时，可以运行：

```bash
pnpm test:unit
```

只运行 API 集成测试时，可以运行 `pnpm test:integration`。当前集成测试包括：

- `tests/integration/auth.integration.test.ts`：注册/登录/refresh/logout、Bearer 与 Cookie、CSRF、黑名单。
- `tests/integration/product-foundation.integration.test.ts`：项目/文档 CRUD、项目删除级联清理与跨用户读取/删除隔离。
- `tests/integration/content.integration.test.ts`：公开新闻/定价本地化读取，以及登录后新闻创建/更新/删除与 revalidate 触发。
- `tests/integration/response-contract.integration.test.ts`：用 OpenAPI 的同一份响应 schema 校验真实响应体，覆盖认证、当前用户、项目/文档、公开内容与上传全流程。

## Web App 授权约定

这个脚手架面向纯 Web App API，不默认引入后台管理系统常见的 RBAC、菜单权限或权限点模型。默认约定是：

- `/api/login` 返回短期 `accessToken` 和长期 `refreshToken`（含 `accessTokenExpiresIn`、`refreshTokenExpiresIn`），同时写入 `httpOnly` cookie，并写入非 `httpOnly` 的 `csrf_token`。响应体**不含** `token` 字段别名。
- `/api/register` 只创建用户，不自动登录；注册成功后需要再调用 `/api/login` 获取 token。
- `/api/refresh` 使用 `refreshToken` 换取新的 `accessToken` 和 `refreshToken`，旧 refresh token 会立即失效。若 refresh token 来自 cookie，需带 `X-CSRF-Token` 请求头，值与 `csrf_token` cookie 一致。
- **refresh token 重放检测**：一次登录派生出的所有轮换 token 共享一个 `familyId`。已撤销的 refresh token 再次被使用时，整条家族链会被立即撤销，攻击者先前换取的 token 同时失效，用户需重新登录。这是 OAuth 2.0 Security BCP 对 refresh token 泄露的标准应对。
- **登出允许过期凭证**：`/api/logout` 接受已过期但签名有效的 access token。登录态过期后用户依然必须能主动撤销会话，否则最需要登出的场景反而登不出去。
- **账号级失败锁定**：连续登录失败达到 `LOGIN_MAX_FAILED_ATTEMPTS` 后临时锁定该账号（依赖 Redis）。仅按 IP 限流挡不住分布式撞库。
- `authMiddleware` 优先读取 `Authorization: Bearer <accessToken>`，也支持浏览器请求携带的 `access_token` cookie，适合 `/api/me`、项目、文档、上传、新闻写操作等必须登录的接口。
- 使用 cookie 认证访问 POST/PATCH/PUT/DELETE 等非安全方法时，需带 `X-CSRF-Token` 请求头；Bearer 认证不受 CSRF 规则影响。
- `optionalAuthMiddleware` 适合“登录用户和匿名用户都能访问，但返回内容略有差异”的接口，支持 Bearer 和 `access_token` cookie；当前脚手架提供中间件但未默认挂载示例路由。公开内容读接口（新闻/定价）本身无需登录，也不走该中间件。
- 资源归属校验放在 service 层，例如只能修改自己的资料、只能删除自己的上传任务、只能访问自己的项目与文档。
- 如果业务后续出现管理员后台、多角色协作或租户权限，再按业务引入 role/permission，不作为前台 Web App starter 的默认复杂度。

### Bearer 与 Cookie 怎么选

- 前端显式管理 token、移动端、小程序或第三方客户端：使用 `Authorization: Bearer <accessToken>`，并在 access token 过期后调用 `/api/refresh`。
- 同站点或同主域 Web App：可以使用服务端写入的 `httpOnly` cookie，降低 XSS 直接读取 token 的风险；前端需要读取 `csrf_token` cookie 并在非安全请求中放入 `X-CSRF-Token`。
- 生产环境 cookie 默认 `AUTH_COOKIE_SECURE=true`，本地开发默认 `false`。服务端 CORS 已启用 `credentials: true`，跨站 cookie 场景还需要前端请求设置 `credentials: "include"`，并按真实域名补充 SameSite 和 HTTPS 策略。

### 默认模块分层

| 层级         | 模块                                                                            | 建议                                                           |
| ------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 核心必留     | health/ready、env 校验、统一错误、requestId、日志、Zod 校验、OpenAPI、migration | 普通 Web App API 的基础设施，不建议删除                        |
| Web App 基础 | auth、access/refresh token、`/api/me`、用户资料、工作台项目、编辑器文档         | 与 `nuxt-modern-starter` 前端默认联调的主路径                  |
| 公开内容     | `/api/content/news`、`/api/content/pricing`、可选 Nuxt revalidate               | 营销站新闻/定价页；当前为内存数据源，可按业务换成 CMS/数据库   |
| 常用增强     | 普通图片上传、头像上传、Redis JWT 黑名单                                        | 需要用户资料图、登出立即失效时保留                             |
| 可选增强     | 大文件分片上传、秒传、本地 `.data` 会话                                         | 适合网盘、素材、视频等场景；普通内容站或 SaaS 表单应用可以删除 |

### 用户与资料模型

默认有六张核心业务表：`Users`、`UserProfiles`、`UserRefreshTokens`、`Workspaces`、`Projects`、`Documents`。`Users` 与 `UserProfiles` 是一对一关系；每个用户有一个默认 personal Workspace；每个 Project 对应一个 Document；头像仅存 `Users.avatar`，`/api/me` 与 `/api/me/profile` 读取时均来自该字段。

### 大文件分片上传

大文件上传走 `init -> PUT chunk -> status -> merge` 流程：

- `POST /api/uploads/large/init` 提交 `fileName`、`fileSize`、`chunkSize`、`fileMd5`，如果全局 MD5 索引命中且文件仍存在，会直接秒传返回公开 URL。
- `PUT /api/uploads/large/:uploadId/chunks/:chunkIndex` 使用 multipart 字段 `chunk` 上传分片，并通过 `X-Chunk-Md5` 校验单片内容。
- `GET /api/uploads/large/:uploadId/status` 返回已收到且大小正确的分片下标，用于断点续传。
- `POST /api/uploads/large/:uploadId/merge` 合并所有分片，服务端会再次校验整文件 MD5 和大小。
- `DELETE /api/uploads/large/:uploadId` 取消任务并清理临时分片与会话。
- 上传会话、完成标记和秒传索引保存在本地 `.data/`，最终文件落在 `uploads/large/` 并通过 `/uploads/...` 公开访问。

当前大文件上传是本地磁盘实现，适合单实例；多实例部署前应改为对象存储或把会话/锁迁移到共享基础设施。

## 生产部署

1. 准备生产环境变量：

```bash
cp .env.production.example .env.production
```

务必替换 `JWT_SECRET`、`DB_PWD`、`MYSQL_ROOT_PASSWORD`、`REDIS_PASSWORD`、`REVALIDATE_SECRET` 等占位值；生产启动时会拒绝 `replace_with` / `change_me` 这类模板值。
生产环境建议显式配置 `CORS_ORIGINS`、`REQUEST_BODY_LIMIT`、`TRUST_PROXY`、`RATE_LIMIT_MAX`、`AUTH_RATE_LIMIT_MAX`、`ACCESS_TOKEN_TTL_SECONDS`、`REFRESH_TOKEN_TTL_SECONDS`、`AUTH_COOKIE_SECURE`、`BCRYPT_ROUNDS`、`LOGIN_MAX_FAILED_ATTEMPTS`，并根据真实流量调整请求体大小限制、限流窗口和登录态有效期。
限流计数使用 Redis 共享存储，因此多实例部署时阈值在整个集群内生效；未配置 `REDIS_URL` 时会退化为单进程内存计数并打印告警。
若前端依赖新闻写操作后的 SWR 缓存失效，还需配置可达的 `NUXT_REVALIDATE_URL` 与匹配的 `REVALIDATE_SECRET`。
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

生产 Compose 会启动 MySQL、Redis、API 应用和 Nginx 网关。`api` 服务暴露 `/health` 健康检查，网关会等待 API healthy 后再启动。应用还提供 `/ready`，用于检查 MySQL 和启用状态下的 Redis；当 `AUTH_TOKEN_BLACKLIST_ENABLED=false` 时，Redis 检查会标记为 `disabled`。
生产 Compose 默认只把 Nginx 网关映射到宿主机 `GATEWAY_HOST_PORT`（默认 `2027`），`api` 的 3000 端口只在 Compose 网络内部使用。

### 部署约定

- 生产镜像使用多阶段构建，运行阶段只包含 `dist`、生产依赖和 `docs/openapi.yaml`。
- 生产日志默认输出到 stdout/stderr，便于容器平台采集；如需同时写入 `logs/`，设置 `LOG_TO_FILE=true`。
- `uploads` 和 `.data` 在生产 Compose 中使用 volume 持久化；多实例部署前需重新设计上传存储和大文件上传会话存储。
- 如需使用国内或企业 npm registry 构建镜像，可在 `.env.production` 设置 `NPM_REGISTRY=https://registry.npmmirror.com`。
- 应用会处理 `SIGTERM` / `SIGINT`，关闭 HTTP server、MySQL 与启用状态下的 Redis 连接后退出；顶层还注册了 `unhandledRejection` / `uncaughtException` 兜底，保证异常先落日志再退出。
- 应用暴露 `/metrics`（Prometheus 文本格式），含 `http_requests_total`、`http_request_duration_seconds` 与 Node 默认进程指标。指标标签使用路由模板而非真实 URL，避免时间序列基数爆炸。
- **`/metrics` 不经 Nginx 网关暴露**，只在 Compose 网络内可达，应由集群内 Prometheus 直接抓取。如需对外暴露，请自行加认证或网络隔离。
- 进程内置后台清理任务，按 `CLEANUP_INTERVAL_MS` 周期删除过期/已撤销的 refresh token 会话行与掉线遗留的上传临时分片。多实例部署时各实例都会执行，清理本身幂等，但如需严格单点执行应改为外部定时任务。

## 裁剪指南

Redis 现在同时服务于三件事：JWT 黑名单、分布式限流计数、登录失败锁定。因此它的启用条件是「是否配置了 `REDIS_URL`」，而不是某一个功能开关。

移除 `REDIS_URL` 后应用仍可启动，但会同时失去这三项能力，并在启动日志中打印告警：

- 已签发的 JWT 在自然过期前无法被主动失效；
- 限流退化为单进程内存计数，多实例部署下实际阈值等于配置值乘以实例数；
- 账号级登录失败锁定不再生效，只剩基于 IP 的限流。

只想关闭黑名单、保留另外两项能力时，设置 `AUTH_TOKEN_BLACKLIST_ENABLED=false` 并保留 `REDIS_URL`。`/ready` 会在没有 Redis 时把它标记为 `disabled`。

**单实例小流量场景可以接受无 Redis；面向生产的多实例部署不建议。**

如果你要彻底删除 Redis 依赖，再移除 `src/redis.ts`、`src/infrastructure/auth/redis-token-blacklist.ts`、Docker Compose 中的 Redis service，以及相关环境变量，并在 `src/runtime.ts` 注入空实现。

如果业务不需要普通图片上传，可以移除 `src/modules/upload/upload.routes.ts` 中对应路由和图片 HTTP 文件；本地实现位于 `src/infrastructure/storage/local-file-storage.adapter.ts`。

如果业务不需要大文件分片上传，可以移除模块内 controller/multer/schema/constants/port、对应路由，以及 `src/infrastructure/storage/local-large-upload.adapter.ts`。

如果业务不需要公开新闻/定价内容，可以移除 `src/modules/content/`、`src/infrastructure/content/`、`src/infrastructure/revalidation/`、`src/runtime.ts` 中的模块组装和 `src/openapi.ts` 对应 paths。

当前组合根注入 `localFileStorage` 和 `localLargeUploadStorage`，并用 `.data` 保存大文件上传会话，适合单实例部署。多实例场景应实现同一 Ports 的 OSS/S3/MinIO Adapter，并在 `src/runtime.ts` 一次性替换。
