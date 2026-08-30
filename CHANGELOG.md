# 更新日志

本文件记录对使用方可见的变更。版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 安全

- **修复未认证的远程拒绝服务漏洞。** 畸形的 `access_token` Cookie（如 `access_token=%`）会让 Cookie 解析抛出 `URIError`；该异常发生在 `async` 认证中间件中，而 Express 4 不捕获中间件的 Promise reject，最终触发 Node 的未处理 rejection 并终止进程。现在解码失败按“无此 Cookie”处理，异步中间件统一经 `asyncMiddleware` 包装，并新增了进程级 `unhandledRejection` / `uncaughtException` 兜底。
- **新增 refresh token 重放检测。** 一次登录派生出的所有轮换 token 共享 `familyId`。当已撤销的 refresh token 再次被使用时，整个家族会被立即撤销（撤销在失败事务之外单独提交），使攻击者已换取的 token 同时失效。
- **新增账号级登录失败锁定。** 连续失败达到 `LOGIN_MAX_FAILED_ATTEMPTS` 后临时锁定该账号，弥补仅按 IP 限流无法防御分布式撞库的缺口。无 Redis 时该能力降级为不锁定。
- 限流计数改用 Redis 共享存储，修复多实例部署下实际阈值等于配置值乘以实例数的问题。
- 注册密码下限提高到 8 位，并显式拒绝超过 bcrypt 72 字节上限的密码；登录侧不套用该下限，避免把存量短密码用户挡在门外。
- bcrypt 代价因子改为可配（`BCRYPT_ROUNDS`），默认提高到 12。

### 新增

- `/metrics` 暴露 Prometheus 指标，含 RED 三类信号与 Node 默认进程指标。该端点不经 Nginx 网关暴露，仅供集群内抓取。
- 后台清理任务：定期删除过期/已撤销的 refresh token 会话行，以及客户端掉线遗留的大文件上传临时分片。
- 业务接口新增 `/api/v1` 版本前缀；`/api` 作为兼容别名保留，指向同一实现。
- 单元测试覆盖率阈值门禁，已接入 `pnpm run check`。

### 变更

- **`GET /api/projects` 改为分页返回。** 响应 `data` 中新增 `pagination`（`total` / `limit` / `offset` / `hasMore`），默认单页 20 条，上限 100。此前返回全量列表，项目数增长后必然出问题。**前端需要同步适配。**
- Sequelize 模型改为 class-based `Model.init` 并接入 `InferAttributes`，消除了 39 处 `.get("field") as T` 强制类型转换，字段名与类型现在由编译器校验。
- 架构守卫规则收紧：跨模块引用模型只允许 `import type`，值导入仍被拒绝。
- 错误分派不再依赖错误文案与 `error.name` 字符串匹配，改用 `AppError` 类型判断。
- Redis 客户端的启用条件由 `AUTH_TOKEN_BLACKLIST_ENABLED` 改为“是否配置了 `REDIS_URL`”，因为它现在同时服务于黑名单、限流和登录失败计数。
- `/logout` 接受已过期但签名有效的 access token，使登录态过期后仍能主动撤销会话。

### 工程

- 新增 `.editorconfig`、`.nvmrc`、`CONTRIBUTING.md`、`CODEOWNERS`、PR 模板与 Dependabot 配置。
