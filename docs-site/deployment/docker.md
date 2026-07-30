# Docker 部署设计

项目提供开发和生产两套 Docker Compose 组合，并通过一个 Nginx 网关统一对外暴露服务。

## Docker 文件结构

```text
docker/
  Dockerfile
    生产镜像，多阶段构建

  Dockerfile.dev
    开发镜像，安装 pnpm 和 native 依赖构建工具

  docker-compose.base.yaml
    MySQL、Redis、api 公共定义

  docker-compose.dev.yaml
    开发覆盖配置

  docker-compose.yaml
    生产覆盖配置

  nginx/gateway.docker.conf
    Nginx 网关配置
```

## 组合方式

开发环境：

```bash
docker compose \
  --env-file .env.development \
  -f docker/docker-compose.base.yaml \
  -f docker/docker-compose.dev.yaml \
  up -d --build
```

脚本：

```bash
pnpm docker:dev
```

生产环境：

```bash
docker compose \
  --env-file .env.production \
  -f docker/docker-compose.base.yaml \
  -f docker/docker-compose.yaml \
  up -d --build
```

脚本：

```bash
pnpm docker:prod
```

## 公共服务

`docker-compose.base.yaml` 定义：

- `mysql`
- `redis`
- `api`

### MySQL

镜像：

```text
mysql:8.4
```

环境变量来自 `.env.*`：

- `MYSQL_ROOT_PASSWORD`
- `DB_NAME`
- `DB_USER`
- `DB_PWD`

健康检查使用 `mysqladmin ping`。

### Redis

镜像：

```text
redis:7-alpine
```

启动命令开启：

- 密码认证。
- AOF 持久化。

健康检查使用：

```bash
redis-cli -a "$REDIS_PASSWORD" ping
```

### api

公共配置中：

- 使用 `docker/Dockerfile` 构建。
- 等 MySQL 和 Redis healthy 后启动。
- 注入 `DB_HOST=mysql`。
- 注入 Compose 内部 Redis URL。
- 配置 `/health` 健康检查。
- `stop_grace_period: 15s`，配合应用优雅关闭。

## 开发 Compose

`docker-compose.dev.yaml` 的特点：

- 项目名：`nuxt-modern-starter-api-dev`
- MySQL 暴露宿主机 `3306`
- Redis 暴露宿主机 `6379`
- API 暴露 Node 调试端口 `9229`
- 源码通过 volume 挂载到 `/app`
- `node_modules` 使用独立 volume
- 容器启动时执行 `pnpm install` 和 `pnpm dev`
- Nginx 网关暴露宿主机 `2027`

开发环境适合：

- 不想本机安装 MySQL/Redis。
- 希望用接近生产的网关入口调试。
- 需要容器内运行 Node 服务。

## 生产 Compose

`docker-compose.yaml` 的特点：

- 项目名：`nuxt-modern-starter-api-prod`
- MySQL 数据持久化到 volume。
- Redis 数据持久化到 volume。
- `uploads` 持久化到 volume。
- `.data` 持久化到 volume。
- 只通过 Nginx 网关暴露宿主机端口。
- `api` 的 `3000` 只在 Compose 网络内部使用。

生产环境暴露：

```text
GATEWAY_HOST_PORT，默认 2027
```

## 生产镜像

`docker/Dockerfile` 是多阶段构建。

阶段：

```text
base
  安装 pnpm

deps
  安装完整依赖和 native 编译工具

build
  复制源码并运行 pnpm run build，产出 dist/

prod-deps
  只安装生产依赖并 prune store

runtime
  复制 node_modules、dist、docs、package.json
  创建非 root 用户 nodejs
  运行 node dist/server.js
```

运行镜像不会复制 `src/`、`tests/` 或 `docs-site/`。运行时需要的接口文档来自 `docs/openapi.yaml`，API 实际启动入口是 `dist/server.js`；数据库迁移命令使用 `dist/migrate.js`。

运行阶段默认：

- `APP_ENV=production`
- `NODE_ENV=production`
- `PORT=3000`
- `LOG_TO_FILE=false`

生产日志默认输出到 stdout/stderr，方便容器平台采集。

## Nginx 网关

配置文件：

```text
docker/nginx/gateway.docker.conf
```

监听：

```text
2027
```

反向代理到：

```text
api:3000
```

转发路径：

- `/api/`
- `/api`
- `/uploads/`
- `/uploads`
- `/openapi.yaml`
- `/api-docs`
- `/ready`
- `/health`

`/api` 和 `/api-docs` 会转发：

- `Host`
- `X-Real-IP`
- `X-Forwarded-For`
- `X-Forwarded-Proto`

应用侧应设置：

```text
TRUST_PROXY=1
```

这样 Express 能正确识别客户端 IP。

## 大文件上传与网关

Nginx 设置：

```text
client_max_body_size 1100M
```

这是为了允许大文件相关请求通过网关。

不过实际分片接口单片最大 8MB。这里设置较大主要是为了给未来扩展和普通大请求留余量。

## 部署流程建议

生产部署建议：

1. 准备 `.env.production`。
2. 替换所有密钥、密码和域名。
3. 构建应用。
4. 执行数据库迁移。
5. 启动 Compose。
6. 检查 `/health` 和 `/ready`。

命令：

```bash
cp .env.production.example .env.production
pnpm build
pnpm db:migrate:prod
pnpm docker:prod
```

停止：

```bash
pnpm docker:prod:down
```

## volume 设计

生产 Compose 中：

```text
mysql_data
redis_data
app_uploads
app_data
```

含义：

- `mysql_data`：MySQL 数据。
- `redis_data`：Redis AOF 数据。
- `app_uploads`：上传后的公开文件。
- `app_data`：大文件上传会话、完成标记、秒传索引。

如果删除这些 volume，对应数据会丢失。

## 多实例部署注意

当前 Compose 是单实例设计。

如果要多实例：

- `uploads` 不能只放本地 volume。
- `.data` 不能只放本地 volume。
- 大文件合并需要分布式锁。
- 秒传索引需要共享存储。
- sticky session 不能从根本解决文件落盘不一致。

推荐改造：

- 上传文件放对象存储。
- 大文件分片走对象存储 multipart。
- 会话和锁放 Redis 或数据库。
- API 实例无状态化。
