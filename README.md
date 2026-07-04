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
pnpm db:drop-create
pnpm docker:dev
```

Swagger: `http://localhost:3000/api-docs`，OpenAPI: `http://localhost:3000/openapi.yaml`。
