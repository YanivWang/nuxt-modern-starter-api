# 开发、测试与质量门禁

项目把类型、格式、lint、接口文档、测试和构建串成一个完整质量门禁。

## 常用脚本

```bash
pnpm dev
pnpm dev:debug
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
pnpm run check
```

它也是 CI 执行的命令。

## check 做了什么

`package.json` 中：

```text
typecheck
  -> lint
  -> format:check
  -> openapi:check
  -> test
  -> build
```

这保证：

- TypeScript 类型正确。
- ESLint 规则通过。
- Prettier 格式一致。
- OpenAPI 生成物与源码同步。
- 单元测试和集成测试通过。
- 生产 TypeScript 构建成功。

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

这样脚本也会被类型检查覆盖。

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

忽略目录：

- `dist`
- `coverage`
- `logs`
- `uploads`
- `.data`
- `node_modules`

这些都是构建、测试或运行时产物。

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
cross-env APP_ENV=test NODE_ENV=test vitest run --exclude "src/**/*.integration.test.ts"
```

当前覆盖：

- `trimmedStringFromUnknown`
- OpenAPI 生成一致性
- Redis 环境变量行为

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

当前 `auth-user.integration.test.ts` 覆盖：

- 注册用户。
- 重复用户名返回 409。
- 登录返回 accessToken 和 refreshToken。
- Bearer access token 可访问 `/api/me`。
- httpOnly Cookie access token 可访问 `/api/me`。
- Cookie 写操作要求 CSRF。
- refresh token 会轮换。
- 旧 refresh token 重放失败。
- 未登录访问 `/api/me` 返回 401。
- 登出后 access token 被黑名单拒绝。
- 登出后 refresh token 被撤销。

当前 `product-foundation.integration.test.ts` 覆盖：

- 标准 `{ code, message, data }` 响应 envelope。
- 登录用户创建项目，并在同一事务中初始化关联 Document。
- 列出、读取项目详情，以及读取/保存自己的文档。
- 删除自己的项目，并验证关联 Document 被级联清理。
- 跨用户无法读取、删除他人的项目或文档（当前集成测试覆盖 GET/DELETE 隔离，PATCH 越权由 service 层按 `ownerId` 过滤并在代码审查中约束）。

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
```

检查：

```bash
pnpm openapi:check
```

如果接口或 schema 变化后忘记更新 `docs/openapi.yaml`，CI 会失败。

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
5. 运行 `pnpm run check`。

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
