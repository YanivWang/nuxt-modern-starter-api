# 开发、测试与质量门禁

项目把类型、格式、lint、接口文档、测试和构建串成一个完整质量门禁。

## 常用脚本

```bash
pnpm dev
pnpm dev:debug
pnpm architecture:check
pnpm env:check
pnpm typecheck
pnpm lint
pnpm format
pnpm format:check
pnpm openapi:generate
pnpm openapi:check
pnpm test
pnpm build
pnpm check
```

最重要的是：

```bash
pnpm check
```

它与 CI 执行的 `pnpm run check` 等价。

## check 做了什么

`package.json` 中：

```text
architecture:check
  -> env:check
  -> typecheck
  -> lint
  -> format:check
  -> openapi:check
  -> contract:check-consumer
  -> test
  -> build
```

这保证：

- 模块、HTTP 层与 infrastructure 之间的导入边界没有被破坏。
- `.env.production.example` 里的每个应用变量都真的传进了生产 api 容器。
- TypeScript 类型正确。
- ESLint 规则通过。
- Prettier 格式一致。
- OpenAPI 生成物与源码同步。
- 前端引入的契约副本没有落后于本仓库。
- 单元测试和集成测试通过。
- 生产 TypeScript 构建成功。

## 架构边界检查

命令：

```bash
pnpm run architecture:check
```

执行 `scripts/validate-architecture.mjs`，它扫描 `src/**/*.ts` 的相对导入，命中以下任意一条就报错退出：

- `src/modules/` 下的文件导入 `src/infrastructure/`（具体 Adapter 只能由 `src/runtime.ts` 选择）。
- 跨模块导入的目标不是对方的 `index.ts`、`*.contract.ts` 或 `ports/` 下的文件。
- `*.service.ts` 导入 `src/middlewares/`（应用服务不依赖 HTTP 中间件）。

它是纯静态检查，不需要 MySQL 或 Redis，因此排在 `check` 的第一步。

## 类型检查

命令：

```bash
pnpm run typecheck
```

执行：

```bash
tsc --noEmit -p tsconfig.json
```

`tsconfig.json` 包含：

- `src/**/*.ts`
- `src/types/**/*.d.ts`
- `scripts/**/*.ts`
- `tests/**/*.ts`

这样运行时代码、脚本和测试都会被类型检查覆盖。生产构建使用 `tsconfig.build.json`，只编译 `src/**/*.ts` 到 `dist/`。

## lint

命令：

```bash
pnpm run lint
```

ESLint 配置：

```text
eslint.config.js
```

关键规则：

- TypeScript 类型感知推荐规则。
- 强制 consistent type imports。
- 禁止 floating promises。
- 禁止误用 promises。
- 关闭 require-await。
- 对脚本和测试放宽少量 unsafe 规则。
- 测试例外规则只匹配 `tests/**/*.ts`，运行时代码不再混放 `.test.ts`。

忽略目录：

- `dist`
- `coverage`
- `logs`
- `uploads`
- `.data`
- `.pnpm-store`
- `node_modules`
- `docs-site/.vitepress/dist`

这些都是构建、测试、依赖缓存或运行时产物。

## 格式化

命令：

```bash
pnpm run format
pnpm run format:check
```

项目使用 Prettier 统一格式。

注意：`format` 会写文件；`format:check` 只检查。

## 测试结构

项目测试分三部分：

```text
test:unit
  不依赖外部服务的单元测试

test:integration
  依赖 MySQL 和 Redis 的 API 集成测试

test:env
  单独验证环境变量导入与校验
```

测试文件按目录边界摆放：

- `tests/unit/`：不依赖外部服务的单元测试。
- `tests/integration/`：依赖 MySQL/Redis 的 API 集成测试。
- `src/`：只保留运行时代码，不放测试文件。

总命令：

```bash
pnpm test
```

## 单元测试

命令：

```bash
pnpm test:unit
```

执行：

```bash
cross-env APP_ENV=test NODE_ENV=test vitest run
```

当前覆盖：

- OpenAPI 生成一致性（含 `docs/openapi.yaml` 同步检查）
- Redis 环境变量行为（含关闭黑名单时允许不配置 Redis）
- Nuxt revalidate Adapter 的路径、请求与跳过逻辑（`tests/unit/infrastructure/revalidation.test.ts`）
- refresh token 轮换的事务与行锁参数
- ContentRepository/ContentRevalidator Port 注入
- Workspace、Project、Document 使用同一个事务

## 集成测试

命令：

```bash
pnpm test:integration
```

执行：

```bash
cross-env APP_ENV=test NODE_ENV=test vitest run --config vitest.integration.config.ts
```

集成测试依赖：

- MySQL
- Redis
- `.env.test`

`tests/integration/support/test-runtime.ts` 会在连接和清表前强制校验 `APP_ENV=test`，并要求 `DB_NAME` 明确包含 `test`；不满足时直接拒绝运行。

当前 `tests/integration/auth.integration.test.ts` 覆盖：

- 注册用户。
- 重复用户名返回 409。
- 登录返回 `accessToken`、`refreshToken` 及对应 TTL 字段（**无** `token` 别名）。
- Bearer access token 可访问 `/api/me`。
- httpOnly Cookie access token 可访问 `/api/me`。
- Cookie 写操作要求 CSRF。
- refresh token 会轮换。
- 旧 refresh token 重放失败。
- 未登录访问 `/api/me` 返回 401。
- 登出后 access token 被黑名单拒绝。
- 登出后 refresh token 被撤销。

当前 `tests/integration/product-foundation.integration.test.ts` 覆盖：

- 标准 `{ code, message, data }` 响应 envelope。
- 登录用户创建项目，并在同一事务中初始化关联 Document。
- 列出、读取项目详情，以及读取/保存自己的文档。
- 删除自己的项目，并验证关联 Document 被级联清理。
- 跨用户无法读取、删除他人的项目或文档（当前集成测试覆盖 GET/DELETE 隔离，PATCH 越权由 service 层按 `ownerId` 过滤并在代码审查中约束）。

当前 `tests/integration/content.integration.test.ts` 覆盖：

- 无需登录即可按 `Accept-Language` / `locale` 获取本地化新闻列表与详情。
- 未知新闻 slug 返回 404。
- 无需登录即可获取本地化定价页内容。
- 登录后可创建/更新/删除新闻，并触发 Nuxt revalidate（`paths` 含中英文新闻列表与详情）。
- 未登录新闻写操作返回 401。

### 当前未覆盖（集成测试 gap）

- `/api/me/profile` GET/PATCH（含 avatar 写入 `Users.avatar`）
- 上传模块（普通 / 大文件 / 秒传）
- Cookie 认证下 PATCH 文档/项目的 CSRF 行为
- 限流 429、`/ready` 探针
- `optionalAuthMiddleware`（中间件存在但未挂载路由）
- 项目 `PATCH` 跨用户隔离的集成断言（service 已按 `ownerId` 过滤）

## 环境变量测试

命令：

```bash
pnpm test:env
```

只做一件事：

```ts
import "../src/env.js";
```

如果配置不合法，导入阶段就会失败。

## OpenAPI 检查

生成：

```bash
pnpm openapi:generate
pnpm format
```

`openapi:generate` 直接输出 js-yaml 的原始格式，与 Prettier 的 YAML 风格不同，因此生成后需要再跑一次 `pnpm format`，否则 `format:check` 会失败。

检查：

```bash
pnpm openapi:check
```

`openapi:check` 比较的是解析后的 spec，不比较 YAML 文本格式。如果接口或 schema 变化后忘记更新 `docs/openapi.yaml`，CI 会失败。

## 构建

命令：

```bash
pnpm run build
```

执行：

```bash
tsc -p tsconfig.build.json
```

输出：

```text
dist/
```

生产运行：

```bash
node dist/server.js
```

## CI

配置：

```text
.github/workflows/ci.yml
```

触发：

- push 到 main
- pull request 到 main

CI services：

- MySQL 8.4
- Redis 7 alpine

流程：

1. Checkout。
2. Setup pnpm。
3. Setup Node.js 22。
4. 安装依赖。
5. 运行 `pnpm run check`（架构边界 → 类型 → lint → 格式 → OpenAPI 同步 → 测试 → 构建）。

## 新人开发建议

提交前建议运行：

```bash
pnpm run check
```

如果只改文档：

```bash
pnpm docs:build
pnpm run format:check
```

如果只改 OpenAPI：

```bash
pnpm openapi:generate
pnpm format
pnpm openapi:check
```

如果只改认证/用户接口：

```bash
pnpm test:integration
```

如果只改工具函数：

```bash
pnpm test:unit
```

## 排查失败思路

### typecheck 失败

先看 TypeScript 报错文件。常见原因：

- import 类型没有使用 `import type`。
- `req.validated` 类型断言不完整。
- Sequelize `Model.get()` 返回 unknown 后没有处理类型。

### lint 失败

常见原因：

- Promise 没有 await 或 void。
- 类型导入没有单独写成 type import。
- 测试之外使用 unsafe assignment。

### format:check 失败

运行：

```bash
pnpm format
```

### openapi:check 失败

运行：

```bash
pnpm openapi:generate
```

然后确认 `docs/openapi.yaml` 的变化符合接口修改。

### integration test 失败

优先确认：

- MySQL 是否启动。
- Redis 是否启动。
- `.env.test` 中连接信息是否匹配本地服务。
- 测试数据库是否能创建表。

## 覆盖率门禁

单元测试带覆盖率阈值，配置在 `vitest.config.ts`，通过 `pnpm test:coverage` 执行，并已接入 `pnpm run check`。

统计范围只包含单元测试真正应当覆盖的纯逻辑（`shared/`、`utils/`、各模块 `*.service.ts`、Cookie 解析、上传纯逻辑、revalidator）。路由装配、模型定义和组合根由集成测试保证，把它们计入分母只会让阈值失去指导意义。`src/utils/logger.ts` 被显式排除——它是 winston transport 装配，在 import 期执行，对它做覆盖率要求只会催生无意义的测试。

阈值的定位是**防回退**，不是追求数字。约定是只升不降：补完测试后如果实测值明显高出当前阈值，请顺手把阈值上调。

## 测试环境的 bcrypt 代价

`.env.test` 把 `BCRYPT_ROUNDS` 设为允许范围内的最低值 10。哈希强度不是集成测试要验证的东西，而按生产代价（12）运行会让每次注册登录多花数百毫秒，把断言压到超时。

集成测试的 `testTimeout` 设为 30 秒：它们要走真实 MySQL、Redis 和 bcrypt，默认 5 秒不足以覆盖多次注册登录的用例。
