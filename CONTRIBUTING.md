# 贡献指南

## 环境准备

需要 Node（见 `.nvmrc`）、pnpm 10.17+，以及可用的 MySQL 8 和 Redis 7。

```bash
pnpm install
cp .env.example .env.development
pnpm dev
```

不想在本机装数据库时，用 Docker 起依赖：

```bash
pnpm docker:dev
```

## 提交前必须通过的门禁

```bash
pnpm run check
```

它按顺序执行架构边界校验、类型检查、lint、格式检查、OpenAPI 同步校验、测试（含覆盖率阈值）和构建。CI 跑的是同一条命令，因此本地通过基本等价于 CI 通过。

集成测试依赖真实 MySQL 与 Redis，默认读取 `.env.test`。只想跑不依赖外部服务的部分时：

```bash
pnpm test:unit
```

## 架构约定

这些规则由 `scripts/validate-architecture.mjs` 在 CI 中强制执行，不是建议：

- 业务模块（`src/modules/`）不能导入 `src/infrastructure/` 的具体实现。需要外部能力时在模块内定义 Port，由 `src/runtime.ts` 注入 Adapter。
- 跨模块引用只能指向对方的 `index.ts`、`*.contract.ts`、`ports/`，或以 `import type` 方式引用 `*.model.ts`。模型之间存在外键关系，类型引用不可避免，但不允许建立运行时依赖。
- `*.service.ts` 不能依赖 HTTP 中间件。业务错误使用 `src/shared/errors/app-error.ts`，HTTP 状态码只在 `error.middleware.ts` 映射。
- `src/runtime.ts` 是唯一的组合根。新增基础设施依赖时在这里装配，不要在模块内部 `new` 出来。

## 新增接口

1. 在模块内写 Zod schema，路由挂 `validate(schema)`。
2. 在 `src/openapi.ts` 补对应 path，复用同一份 schema。
3. 运行 `pnpm openapi:generate && pnpm format`，提交生成的 `docs/openapi.yaml`。
4. 业务接口默认走 `/api/v1` 前缀；`/api` 是保留给存量客户端的兼容别名，不要在新文档里推广。

## 数据库变更

结构变更一律通过 `src/db/migrations/` 下的迁移完成，且必须同时提供可用的 `down`。不要使用 `sequelize.sync()`。开发环境本地 schema 混乱时可以 `pnpm db:drop-create` 重建。

## 测试

- `tests/unit/`：不依赖外部服务，用假 database 验证用例逻辑与边界。
- `tests/integration/`：走真实 HTTP + MySQL + Redis，验证契约与跨用户隔离。

单元测试有覆盖率阈值（见 `vitest.config.ts`）。阈值只升不降——补测试时如果实测值明显高出，请顺手把阈值上调，让它持续起到防回退作用。

## 注释约定

文件头说明该文件的真实职责与边界。行内注释只解释跨模块约定、安全边界、并发与幂等处理，以及容易被误改的规则；不要给显而易见的赋值和调用写注释。
