# Express Modern Starter

独立 Express API 服务脚手架，基于参考项目 `apps/backend/rest-api` 提炼，保留通用 Web App 后端能力：auth、user、health、Swagger、MySQL、Redis、JWT、文件上传和 Docker 部署。

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
pnpm db:drop-create
pnpm docker:dev
pnpm docker:prod
```

Swagger: `http://localhost:3000/api-docs`，OpenAPI: `http://localhost:3000/openapi.yaml`。

## 生产部署

1. 准备生产环境变量：

```bash
cp .env.production.example .env.production
```

务必替换 `JWT_SECRET`、`DB_PWD`、`MYSQL_ROOT_PASSWORD`、`REDIS_PASSWORD` 等占位值；生产启动时会拒绝 `replace_with` / `change_me` 这类模板值。

2. 启动 Docker Compose：

```bash
pnpm docker:prod
```

停止服务：

```bash
pnpm docker:prod:down
```

生产 Compose 会启动 MySQL、Redis、REST API 和 Nginx 网关。`rest-api` 暴露 `/health` 健康检查，网关会等待 API healthy 后再启动。

### 部署约定

- 生产镜像使用多阶段构建，运行阶段只包含 `dist`、生产依赖和 `docs/openapi.yaml`。
- 生产日志默认输出到 stdout/stderr，便于容器平台采集；如需同时写入 `logs/`，设置 `LOG_TO_FILE=true`。
- `uploads` 和 `.data` 在生产 Compose 中使用 volume 持久化；多实例部署前需重新设计上传存储和大文件上传会话存储。
- 如需使用国内或企业 npm registry 构建镜像，可在 `.env.production` 设置 `NPM_REGISTRY=https://registry.npmmirror.com`。
- 应用会处理 `SIGTERM` / `SIGINT`，关闭 HTTP server、MySQL 与 Redis 连接后退出。
