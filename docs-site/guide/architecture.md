# 整体架构

项目采用模块化单体，并用显式依赖组装保证业务模块、HTTP 层和基础设施实现之间的单向依赖。

## 依赖方向

```text
server.ts
  -> runtime.ts（唯一组合根）
    -> infrastructure adapters
    -> modules/<domain>/index.ts
      -> routes/controller
        -> application service
          -> contract / port / database dependency

app.ts
  <- 已组装的 Router、Health Router、FileStorage
```

规则：

- `src/runtime.ts` 是唯一选择具体 Adapter 的地方。
- `src/app.ts` 是纯 Express 工厂，不创建数据库、Redis 或业务 Service。
- 模块通过 `index.ts` 暴露模块工厂，通过 `ports/`、`*.contract.ts` 暴露稳定契约。
- 模块不能导入 `src/infrastructure/`，Service 不能导入 Express middleware。
- 跨模块依赖只能指向目标模块的 `index.ts`、`*.contract.ts` 或 `ports/`。
- `pnpm architecture:check` 会检查这些边界。

## 目录职责

```text
src/
  server.ts                   进程监听、信号处理、优雅退出
  runtime.ts                  创建依赖、组装模块、连接和释放基础设施
  app.ts                      Express 中间件和 Router 装配
  env.ts                      环境配置和启动期校验
  db/                         Sequelize、模型注册、Umzug 迁移
  redis.ts                    可选 Redis 连接生命周期
  infrastructure/
    auth/                     Redis TokenBlacklist Adapter
    content/                  InMemory ContentRepository Adapter
    revalidation/             Nuxt ContentRevalidator Adapter
    storage/                  本地 FileStorage/LargeUploadStorage Adapter
  modules/
    auth/ user/ content/ workspace/ document/ upload/
  middlewares/                Express 横切能力
  shared/errors/              与 HTTP 解耦的 AppError
  routes/                     健康和就绪探针工厂
  utils/                      无业务归属的纯工具
```

## 启动与关闭

`server.ts` 调用 `createRuntime()`，随后执行：

1. `database.connect()`：连接 MySQL；开发和测试环境追 pending migrations。
2. `redisConnection.connect()`：黑名单启用时连接 Redis。
3. `localFileStorage.ensureRoot()`：确保当前 Adapter 的存储根目录存在。
4. `runtime.app.listen()`：依赖就绪后才接收流量。

关闭时先停止 HTTP server，再通过 `runtime.disconnect()` 并行释放数据库和 Redis。10 秒超时负责容器停止兜底。

## Express 装配

`createApp(dependencies)` 的顺序是：

```text
helmet / cors
  -> requestId / request log
  -> FileStorage 静态目录
  -> health / ready
  -> rate limit / compression / body parser
  -> Swagger
  -> 已组装的业务 Routers
  -> notFound AppError
  -> errorMiddleware
```

App 不知道 Router 内部的 Service，也不知道 FileStorage 是本地磁盘还是对象存储。

## 模块结构

典型模块：

```text
modules/<domain>/
  index.ts                    模块公开入口和模块工厂
  <domain>.routes.ts          HTTP 路由工厂
  <domain>.controller.ts      HTTP 参数和响应适配
  <domain>.service.ts         应用用例、事务和业务规则
  <domain>.schema.ts          Zod 请求契约
  <domain>.contract.ts        可跨模块使用的 DTO/类型（需要时）
  <domain>.model.ts           Sequelize 模型（需要时）
  ports/                      模块需要的可替换外部能力
```

`routes/controller/service` 都由工厂接收依赖，不再通过 import 获取业务全局单例。Controller 只处理 HTTP；Service 不接收 `Request`、`Response`，也不创建 HTTP 状态码错误。

## Port 与 Adapter

当前真实边界：

| Port                 | 当前 Adapter            | 替换场景                 |
| -------------------- | ----------------------- | ------------------------ |
| `TokenBlacklist`     | Redis                   | 关闭黑名单或更换共享存储 |
| `ContentRepository`  | 进程内内容              | MySQL、CMS               |
| `ContentRevalidator` | Nuxt HTTP revalidate    | 其他前端或消息队列       |
| `FileStorage`        | 本地磁盘                | OSS、S3、MinIO           |
| `LargeUploadStorage` | 本地分片和 `.data` 会话 | 对象存储 multipart       |

替换 Adapter 只修改 `runtime.ts`；业务模块和 HTTP 契约保持不变。

数据库没有为了形式统一而给每张表增加 Repository。当前 CRUD 模块由组合根注入 `AppDatabase`，继续使用 Sequelize Model；只有数据源真正需要替换或领域查询复杂度明显上升时，才新增领域 Repository Port。

## 错误边界

业务和应用层使用 `AppError` 分类：

```text
BAD_REQUEST / UNAUTHORIZED / FORBIDDEN / NOT_FOUND
CONFLICT / GONE / INTERNAL
```

`errorMiddleware` 是唯一把错误分类映射为 HTTP 状态码的地方。未知异常和 `INTERNAL` 不向客户端暴露内部信息；日志保留 requestId、路由模板和完整错误。

## 事务边界

- Workspace、Project、Document 的初始化在同一 Sequelize transaction 内，默认 Workspace 也显式接收该 transaction。
- 项目标题与 Document 标题同步在同一 transaction 内。
- refresh token 轮换使用 transaction 和行锁，查询旧会话、创建新会话、撤销旧会话保持原子性。
- Service 负责完整用例事务，Controller 和 Adapter 不拆分业务事务。

## 数据模型

```text
User
├── UserProfile
├── UserRefreshToken
└── Workspace
    └── Project
        └── Document
```

当前是个人 Workspace 产品边界。没有真实组织协作业务前，不空建 Organization、Member、RBAC、Audit、Billing、CQRS 或 Outbox。团队业务落地后，应先引入 WorkspaceMember 和明确角色，再把资源授权统一收敛到 Workspace 边界。

## 测试结构

```text
tests/unit/          不依赖 MySQL/Redis
tests/integration/   通过 createTestRuntime 使用真实 HTTP、MySQL、Redis
```

集成测试在清理表之前强制要求 `APP_ENV=test` 且 `DB_NAME` 明确包含 `test`，防止外部环境变量误把测试指向非测试库。

## 适用范围

当前架构适合单体 Web API、中小型 SaaS、个人 Workspace、内容接口和单实例本地上传。多实例部署前需要把内存内容、本地文件和分片会话替换为共享 Adapter；复杂团队协作出现后再扩充领域模型，不通过微服务或通用 BaseRepository 提前制造复杂度。

## 架构边界由脚本强制

`scripts/validate-architecture.mjs` 在 CI 中执行以下规则，违反会让构建失败：

1. `src/modules/` 下的业务模块不能导入 `src/infrastructure/` 的具体实现。需要外部能力时在模块内定义 Port，由组合根注入 Adapter。
2. 跨模块引用只能指向对方的 `index.ts`、`*.contract.ts`、`ports/`，或以 **`import type`** 方式引用 `*.model.ts`。
3. `*.service.ts` 不能依赖 HTTP 中间件。

第 2 条中模型的例外值得说明：`Users`、`Workspaces`、`Projects`、`Documents` 之间存在数据库外键关系，模型定义必须互相引用对方的类型，这无法避免。但规则只放行 `import type`——类型导入在编译后被完全擦除，不会在模块之间建立运行时依赖，模型实例仍统一由 `src/db/models.ts` 注册。值导入依然被拒绝。

这条规则的取舍是：与其为了让检查通过而放宽成「模型随便引」，不如把规则做得更精确。

## 组合根装配的依赖

`src/runtime.ts` 是唯一可以选择具体 Adapter 的位置。当前装配：

| 依赖                  | Adapter                         | 用途                             |
| --------------------- | ------------------------------- | -------------------------------- |
| `TokenBlacklist`      | `redis-token-blacklist`         | 登出后使 access token 立即失效   |
| `LoginAttemptTracker` | `redis-login-attempt-tracker`   | 账号级登录失败锁定               |
| 限流计数存储          | `redis-rate-limit.store`        | 多实例共享限流阈值               |
| `ContentRepository`   | `in-memory-content.repository`  | 公开新闻/定价数据源              |
| `ContentRevalidator`  | `nuxt-content-revalidator`      | 内容变更后刷新前端缓存           |
| `FileStorage`         | `local-file-storage`            | 图片上传落盘与公开 URL           |
| `LargeUploadStorage`  | `local-large-upload`            | 分片上传、合并、秒传、清理       |
| 指标                  | `observability/metrics`         | Prometheus RED 指标与 `/metrics` |
| 清理调度              | `maintenance/cleanup.scheduler` | 定期清理会话行与临时分片         |

替换实现（例如把本地磁盘换成 S3）只需要新增一个实现同一 Port 的 Adapter，并在这一个文件里改一行注入。
