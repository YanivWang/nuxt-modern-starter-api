# 快速上手

本页帮助新人把项目跑起来，并理解每个常用命令背后的作用。

## 前置环境

项目运行依赖：

- Node.js `>=20.19.5`
- pnpm `>=10.17.0`
- MySQL 8.x
- Redis 7.x，默认用于 JWT 黑名单

如果只是阅读代码或构建文档，只需要 Node.js 与 pnpm。运行 API 集成测试、本地 API 或 Docker 环境时，需要 MySQL 与 Redis。

## 安装依赖

```bash
pnpm install
```

项目使用 pnpm lockfile 固定依赖版本。`package.json` 中的 `packageManager` 明确要求 `pnpm@10.17.0`，CI 也使用同一主版本。

## 本机启动 API

```bash
cp .env.example .env.development
# 按本机 MySQL/Redis 修改 .env.development 中 DB_*、REDIS_URL、REDIS_PASSWORD 等配置
pnpm dev
```

`pnpm dev` 实际执行：

```bash
cross-env NODE_ENV=development nodemon --exec tsx src/server.ts
```

这表示开发环境直接运行 TypeScript 源码，入口是 `src/server.ts`。它不会自动启动 MySQL 或 Redis，所以你需要先准备依赖服务。

## Docker 开发环境

如果你希望 MySQL、Redis、API 和 Nginx 网关一起启动：

```bash
cp .env.example .env.development
pnpm docker:dev
```

开发 Compose 会启动：

- MySQL：宿主机 `3306`
- Redis：宿主机 `6379`
- REST API：容器内 `3000`
- Nginx 网关：宿主机 `2026`
- Node 调试端口：宿主机 `9229`

访问地址：

- 本机 API：`http://localhost:3000`
- Docker 网关：`http://localhost:2026`
- Swagger：`http://localhost:3000/api-docs` 或经网关 `http://localhost:2026/api-docs`
- OpenAPI YAML：`http://localhost:3000/openapi.yaml` 或 `http://localhost:2026/openapi.yaml`

## 与 Nuxt 前端联调

若同时开发 `nuxt-modern-starter` 前端，请保持以下配置一致：

| 配置项                      | 推荐值                       |
| --------------------------- | ---------------------------- |
| 前端 `NUXT_PUBLIC_API_BASE` | `http://localhost:2026/api`  |
| 后端 `CORS_ORIGINS`         | 包含 `http://localhost:3000` |
| 前端开发地址                | `http://localhost:3000`      |
| API Docker 网关             | `http://localhost:2026`      |

修改 `.env.development` 后需要重建 API 容器，而不是仅 `restart`：

```bash
docker compose --env-file .env.development \
  -f docker/docker-compose.base.yaml \
  -f docker/docker-compose.dev.yaml \
  up -d --force-recreate api
```

联调验证路径：

- 公开站：新闻列表/详情、定价页（`/api/content/*`）
- 登录 → `/app/workspace` 列表/创建/删除 → `/app/workspace/:projectId/edit` 保存文档 → `/app/workspace/:projectId/preview` HTML 预览

## 文档站命令

本 VitePress 文档站位于 `docs-site/`。

```bash
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

用途：

- `docs:dev`：本地开发文档，支持热更新。
- `docs:build`：构建静态文档站，输出到 `docs-site/.vitepress/dist`。
- `docs:preview`：预览已构建的文档站。

## 常用质量命令

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm openapi:check
pnpm test
pnpm build
pnpm check
```

`pnpm check` 是完整质量门禁，会依次运行类型检查、lint、格式检查、OpenAPI 同步检查、测试和构建。CI 中执行的是等价的 `pnpm run check`。

测试文件不放在 `src/` 下：`tests/unit/` 承载不依赖外部服务的单元测试，`tests/integration/` 承载依赖 MySQL/Redis 的 API 集成测试。

## 数据库迁移命令

```bash
pnpm db:migrate
pnpm db:migrate:pending
pnpm db:migrate:executed
pnpm db:migrate:undo
pnpm db:drop-create
```

开发和测试环境启动时会自动执行 pending migrations。生产环境不会自动改表，需要部署时显式执行：

```bash
pnpm build
pnpm db:migrate:prod
```

`db:drop-create` 会删除当前库表再重建，只能用于开发或测试。
