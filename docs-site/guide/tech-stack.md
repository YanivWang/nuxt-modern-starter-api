# 技术栈总览

本项目不是只把 Express 跑起来，而是围绕一个真实 Web App 后端所需的工程能力做了组合。

## 运行时与语言

### Node.js

项目要求 Node.js `>=20.19.5`。代码使用 ESM，`package.json` 中设置了：

```json
{
  "type": "module",
  "main": "dist/server.js"
}
```

这意味着：

- 源码使用 `import/export`。
- TypeScript 编译后仍按 Node ESM 规则运行。
- 本地开发通过 `tsx src/server.ts` 直接执行 TypeScript。
- 生产运行 `node dist/server.js`。

### TypeScript

TypeScript 配置拆成三层：

- `tsconfig.base.json`：基础规则，开启 `strict`，使用 `NodeNext`。
- `tsconfig.json`：开发和类型检查使用，`noEmit: true`，包含 `src` 与 `scripts`。
- `tsconfig.build.json`：生产构建使用，输出 `dist/`。

这套拆分让开发阶段能检查脚本和测试相关代码，生产构建则只产出 API 运行所需的 `src` 编译结果。

## Web 框架与中间件

### Express 4

Express 负责 HTTP 路由、中间件装配和错误处理。项目没有引入更重的框架，主要原因是：

- Express 生态成熟，适合脚手架。
- 中间件模型直观，新人容易理解请求如何流动。
- 业务模块可以按 `routes -> controller -> service` 清晰拆分。

### helmet

`helmet` 提供常见安全响应头。项目中有两处例外：

- `/api-docs`：Swagger UI 需要内联脚本和样式，因此放宽 CSP。
- `/uploads`：上传图片会被前端跨域以 `<img>` 等方式加载，因此将 `Cross-Origin-Resource-Policy` 设为 `cross-origin`，避免浏览器报 `NotSameOrigin`。

其他接口继续使用默认安全头。

### cors

`cors` 根据 `src/env.ts` 读取 `CORS_ORIGINS`：

- 开发和测试环境默认允许任意来源，便于调试。
- 生产环境必须显式配置白名单，否则浏览器跨域请求会被拒绝。
- 项目启用 `credentials: true`，支持 Cookie 登录态。

### express-rate-limit

项目有两类限流：

- 全局限流：保护所有普通请求。
- 认证限流：注册、登录、刷新等接口单独限制，降低暴力破解风险。

探针路由先于全局限流挂载，避免健康检查被真实流量挤出限流窗口。

### compression

压缩中间件只压缩典型 JSON 响应，不压缩图片、音视频、字体、压缩包、流式响应和二进制内容。这避免了对已经压缩或不适合压缩的内容浪费 CPU。

## 数据库与迁移

### MySQL + Sequelize

MySQL 是主业务数据库。Sequelize 负责：

- 数据库连接。
- 模型定义。
- 模型关联。
- 查询和事务。

当前核心表：

- `Users`：登录账号、密码哈希、头像（`avatar`）。
- `UserProfiles`：用户扩展资料（不含头像列）。
- `UserRefreshTokens`：refresh token 会话。
- `Workspaces`：用户工作区，默认 `type = personal`。
- `Projects`：项目元数据，关联工作区与用户。
- `Documents`：编辑器文档内容，与项目一对一关联。

公开内容模块（新闻/定价）当前**不落库**，数据来自 `src/modules/content/` 的内存常量；写操作成功后可通过 `NUXT_REVALIDATE_URL` 通知前端清缓存。

### Umzug

Umzug 管理数据库迁移。迁移记录存放在数据库中，迁移文件位于 `src/migrations/`。

当前共 3 个迁移文件，直接使用 `createTable` / `addIndex` 建表，**不含** `tableExists` 等幂等守卫；开发阶段若需重建 schema，请使用 `pnpm db:drop-create` 或重建数据库 volume。

约定：

- 开发和测试环境连接数据库后自动执行 pending migrations。
- 生产环境只验证连接，不自动改表。
- 生产部署前必须显式执行 `pnpm db:migrate:prod`。

## 认证与安全

### JWT

access token 使用 JWT。它是短期凭证，包含：

- `id`
- `username`
- `jti`
- `iat`
- `exp`

`jti` 用于登出黑名单。没有 `jti` 的 token 会被视为无效。

### Redis

Redis 当前只用于 JWT 黑名单，不是通用缓存层。

当用户登出时，服务把当前 access token 的 `jti` 写入 Redis，TTL 等于 token 剩余寿命。这样可以让无状态 JWT 在登出后立即失效。

如果设置 `AUTH_TOKEN_BLACKLIST_ENABLED=false`：

- 服务不要求 `REDIS_URL`。
- 黑名单操作退化为空操作。
- 已签发 access token 只能等待自然过期。

### refresh token 会话

refresh token 是长期凭证，但数据库只保存 SHA-256 摘要，不保存明文。

刷新登录态时会轮换 refresh token：

1. 校验旧 refresh token 摘要是否存在、未撤销、未过期。
2. 创建新 refresh token 会话。
3. 撤销旧 refresh token，并记录替代 token 摘要。
4. 返回新的 access token 和 refresh token。

这能防止旧 refresh token 被重复使用。

### Cookie + CSRF

登录和刷新成功时，服务在响应体返回 `accessToken` / `refreshToken` 及 TTL 字段，并写入 Cookie：

- `access_token`：httpOnly
- `refresh_token`：httpOnly
- `csrf_token`：非 httpOnly，供前端读取

Bearer 认证适合移动端、第三方客户端或前端显式管理 token 的场景。Cookie 认证适合同站 Web App，但非安全方法需要带 `X-CSRF-Token`，值与 `csrf_token` Cookie 一致。

## 校验与接口文档

### Zod

Zod 是请求校验的单一来源。路由通过 `validate(schema)` 校验：

- `body`
- `query`
- `params`
- `headers`

校验成功后结果写入 `req.validated`；controller 通过 `getValidated<T>(req)` 读取，service 接收已校验的类型化数据，不在 service 层重复做 trim 或长度校验。

### OpenAPI + Swagger

`src/openapi.ts` 从 Zod schema 生成 OpenAPI 3.1 文档。运行时 Swagger 和 `docs/openapi.yaml` 使用同一份定义。

这意味着：

- 接口校验和文档尽量不分叉。
- 修改接口后，需要运行 `pnpm openapi:generate`。
- CI 会运行 `pnpm openapi:check`，防止文档落后于源码。

## 文件上传

### multer

普通图片上传和大文件分片上传都基于 multer。

普通上传限制：

- 支持 `jpeg/png/gif/webp`。
- 通用图片最多 9 张。
- 用户头像/资料图单次最多 1 张。
- 单文件最大 8MB。

### 本地磁盘大文件分片

大文件上传是本地磁盘实现，支持：

- 初始化上传任务。
- 上传分片。
- 查询断点续传状态。
- 合并分片。
- 取消上传。
- 基于全局 MD5 索引的秒传。

当前实现适合单实例部署。多实例部署前，应改造为对象存储或共享会话/锁。

## 工程工具

### Vitest

测试分两类：

- 单元测试：不依赖外部服务。
- 集成测试：依赖 MySQL 和 Redis。

CI 中会启动 MySQL 与 Redis services，然后运行完整 `pnpm run check`。

### ESLint + Prettier

ESLint 使用 TypeScript 类型感知规则，Prettier 负责统一格式。

`pnpm run check` 中会先 lint 再 format:check，确保代码质量和格式都达标。

### Docker + Nginx

生产镜像使用多阶段构建：

- 构建阶段安装完整依赖并编译 TypeScript。
- 运行阶段只保留 `dist`、生产依赖、`docs` 和 `package.json`。
- 运行用户是非 root 用户。

Compose 中 Nginx 作为网关，只暴露 `2026`，API 的 `3000` 端口在 Compose 网络内部使用。
