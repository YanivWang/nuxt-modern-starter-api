# 目录职责索引

本页是项目地图。新人不知道文件在哪里时，可以先查这里。

## 根目录

| 路径                      | 职责                                     |
| ------------------------- | ---------------------------------------- |
| `package.json`            | 脚本、依赖、engines、包管理器声明        |
| `pnpm-lock.yaml`          | 依赖锁文件，自动生成，不手写             |
| `pnpm-workspace.yaml`     | pnpm 工作区与 onlyBuiltDependencies 配置 |
| `README.md`               | 仓库快速说明和常用约定                   |
| `tsconfig.base.json`      | TypeScript 基础配置                      |
| `tsconfig.json`           | 开发类型检查配置，包含 src 与 scripts    |
| `tsconfig.build.json`     | 生产构建配置，输出 dist                  |
| `eslint.config.js`        | ESLint 扁平配置                          |
| `.prettierrc.json`        | Prettier 格式配置                        |
| `.prettierignore`         | Prettier 忽略文件                        |
| `nodemon.json`            | 开发热重载忽略规则                       |
| `.env.example`            | 开发环境变量模板                         |
| `.env.production.example` | 生产环境变量模板                         |
| `.env.test`               | 测试环境变量                             |
| `.gitignore`              | Git 忽略配置                             |
| `.dockerignore`           | Docker 构建忽略配置                      |

## src 根目录

| 路径              | 职责                               |
| ----------------- | ---------------------------------- |
| `src/server.ts`   | Node 进程入口，连接依赖并监听端口  |
| `src/app.ts`      | Express 应用装配                   |
| `src/env.ts`      | 环境变量加载和校验                 |
| `src/db.ts`       | Sequelize 连接和模型导出           |
| `src/redis.ts`    | 可选 Redis 客户端                  |
| `src/migrator.ts` | Umzug 迁移器配置                   |
| `src/migrate.ts`  | 迁移 CLI 入口                      |
| `src/openapi.ts`  | OpenAPI spec 生成                  |
| `src/swagger.ts`  | Swagger UI 与 `/openapi.yaml` 挂载 |

## middlewares

| 路径                                           | 职责                        |
| ---------------------------------------------- | --------------------------- |
| `src/middlewares/auth.middleware.ts`           | 强制登录与 Cookie CSRF 校验 |
| `src/middlewares/optionalAuth.middleware.ts`   | 可选登录态                  |
| `src/middlewares/validate.middleware.ts`       | Zod 请求校验                |
| `src/middlewares/error.middleware.ts`          | 统一错误响应和错误日志      |
| `src/middlewares/asyncHandler.ts`              | 捕获异步 controller 错误    |
| `src/middlewares/rateLimit.middleware.ts`      | 全局限流和认证限流          |
| `src/middlewares/requestId.middleware.ts`      | 请求 ID 注入                |
| `src/middlewares/httpRequestLog.middleware.ts` | HTTP 请求日志               |
| `src/middlewares/compression.middleware.ts`    | JSON 响应压缩               |

## auth 模块

| 路径                                           | 职责                          |
| ---------------------------------------------- | ----------------------------- |
| `src/modules/auth/auth.routes.ts`              | 认证路由                      |
| `src/modules/auth/auth.schema.ts`              | 认证接口 Zod schema           |
| `src/modules/auth/auth.controller.ts`          | 认证 HTTP 控制器              |
| `src/modules/auth/auth.service.ts`             | 注册登录业务                  |
| `src/modules/auth/auth-session.service.ts`     | access/refresh token 会话管理 |
| `src/modules/auth/auth-token.service.ts`       | JWT 黑名单                    |
| `src/modules/auth/jwt-verify.service.ts`       | JWT 校验                      |
| `src/modules/auth/authCookie.ts`               | 认证 Cookie 与 CSRF 工具      |
| `src/modules/auth/user-refresh-token.model.ts` | Refresh token 模型            |

## user 模块

| 路径                                       | 职责                    |
| ------------------------------------------ | ----------------------- |
| `src/modules/user/user.routes.ts`          | 当前用户路由            |
| `src/modules/user/user.schema.ts`          | `/api/me` schema        |
| `src/modules/user/user.controller.ts`      | 当前用户 HTTP 控制器    |
| `src/modules/user/user.service.ts`         | 用户基础资料查询        |
| `src/modules/user/user.model.ts`           | Users 模型              |
| `src/modules/user/user-profile.schema.ts`  | 用户扩展资料 schema     |
| `src/modules/user/user-profile.service.ts` | 用户扩展资料业务        |
| `src/modules/user/user-profile.model.ts`   | UserProfiles 模型与关联 |

## upload 模块

| 路径                                            | 职责                 |
| ----------------------------------------------- | -------------------- |
| `src/modules/upload/upload.routes.ts`           | 上传路由             |
| `src/modules/upload/upload.config.ts`           | 普通上传 multer 配置 |
| `src/modules/upload/upload.controller.ts`       | 普通上传控制器       |
| `src/modules/upload/largeUpload.ts`             | 大文件容量常量       |
| `src/modules/upload/large-upload.schema.ts`     | 大文件上传 schema    |
| `src/modules/upload/large-upload.multer.ts`     | 分片上传 multer 配置 |
| `src/modules/upload/large-upload.controller.ts` | 大文件上传控制器     |
| `src/modules/upload/large-upload.service.ts`    | 大文件上传核心业务   |

## workspace 模块

| 路径                                         | 职责                     |
| -------------------------------------------- | ------------------------ |
| `src/modules/workspace/workspace.routes.ts`    | 项目列表/创建/详情/删除路由 |
| `src/modules/workspace/workspace.schema.ts`    | 项目接口 Zod schema      |
| `src/modules/workspace/workspace.controller.ts` | 项目 HTTP 控制器      |
| `src/modules/workspace/workspace.service.ts` | 默认空间、项目聚合与 DTO |
| `src/modules/workspace/workspace.model.ts`   | Workspaces 模型          |
| `src/modules/workspace/project.model.ts`     | Projects 模型            |

## document 模块

| 路径                                       | 职责               |
| ------------------------------------------ | ------------------ |
| `src/modules/document/document.routes.ts`  | 文档读取/保存路由  |
| `src/modules/document/document.schema.ts`  | 文档接口 Zod schema |
| `src/modules/document/document.controller.ts` | 文档 HTTP 控制器 |
| `src/modules/document/document.service.ts` | 文档读写与归属校验 |
| `src/modules/document/document.model.ts`   | Documents 模型     |

## routes

| 路径                          | 职责                  |
| ----------------------------- | --------------------- |
| `src/routes/health.routes.ts` | `/health` 和 `/ready` |

## models

| 路径                  | 职责                      |
| --------------------- | ------------------------- |
| `src/models/index.ts` | 集中初始化 Sequelize 模型 |

## migrations

| 路径                                                              | 职责                       |
| ----------------------------------------------------------------- | -------------------------- |
| `src/migrations/20260704120000-create-users-and-user-profiles.ts` | 创建 Users 和 UserProfiles |
| `src/migrations/20260704123000-create-user-refresh-tokens.ts`     | 创建 UserRefreshTokens     |
| `src/migrations/20260705150000-create-workspaces-projects-documents.ts` | 创建 Workspaces、Projects、Documents |

## utils

| 路径                                    | 职责                   |
| --------------------------------------- | ---------------------- |
| `src/utils/response.ts`                 | 统一响应格式           |
| `src/utils/logger.ts`                   | Winston 日志           |
| `src/utils/getValidated.ts`             | 读取 req.validated     |
| `src/utils/expressRoutePath.ts`         | 提取路由模板路径       |
| `src/utils/projectRoot.ts`              | 计算项目根路径         |
| `src/utils/trimmedStringFromUnknown.ts` | 未知输入转 trim 字符串 |

## types

| 路径                     | 职责                  |
| ------------------------ | --------------------- |
| `src/types/express.d.ts` | 扩展 Express Request  |
| `src/types/jwt-user.ts`  | JWT 用户 payload 类型 |

## scripts

| 路径                          | 职责                    |
| ----------------------------- | ----------------------- |
| `scripts/generate-openapi.ts` | 生成或校验 OpenAPI YAML |
| `scripts/reset-db.ts`         | 开发/测试重建数据库     |
| `scripts/test-env.ts`         | 环境变量导入校验        |

## docker

| 路径                               | 职责              |
| ---------------------------------- | ----------------- |
| `docker/Dockerfile`                | 生产镜像          |
| `docker/Dockerfile.dev`            | 开发镜像          |
| `docker/docker-compose.base.yaml`  | Compose 公共服务  |
| `docker/docker-compose.dev.yaml`   | 开发 Compose 覆盖 |
| `docker/docker-compose.yaml`       | 生产 Compose 覆盖 |
| `docker/nginx/gateway.docker.conf` | Nginx 网关        |

## docs 与 docs-site

| 路径                             | 职责                 |
| -------------------------------- | -------------------- |
| `docs/openapi.yaml` | OpenAPI 生成物       |
| `docs-site/`        | VitePress 文档站源码 |
| `docs-site/.vitepress/config.ts` | VitePress 配置       |

## 不应手写的内容

不要手写修改：

- `pnpm-lock.yaml`
- `docs/openapi.yaml`
- `dist/`
- `node_modules/`
- `logs/`
- `uploads/`
- `.data/`
- `coverage/`

这些是锁文件、生成物、依赖或运行时数据。
