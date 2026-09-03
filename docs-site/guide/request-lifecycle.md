# 请求生命周期

理解请求从进入服务到返回响应的全过程，是理解这个项目最有效的方式。

## 一个普通 API 请求如何流动

以 `GET /api/v1/me` 为例：

```text
浏览器 / 客户端
  -> Express app
  -> helmet
  -> cors
  -> requestIdMiddleware
  -> metricsMiddleware（记录 RED 指标）
  -> httpRequestLogMiddleware
  -> globalRateLimitMiddleware（Redis 共享计数）
  -> compressionMiddleware
  -> express.json / express.urlencoded
  -> runtime 注入的 user.routes
  -> createAuthMiddleware(verifier) 生成的 authMiddleware
  -> validate(getMeSchema)
  -> asyncHandler(getMe)
  -> user.controller.ts（工厂闭包持有 UserService）
  -> user.service.ts（组合根注入 AppDatabase）
  -> Sequelize 查询 Users + UserProfiles
  -> success(res, "获取当前用户成功", { user })
  -> httpRequestLogMiddleware 在 finish 事件写日志
```

## requestId

`requestIdMiddleware` 会优先读取请求头 `X-Request-Id`。如果客户端没有传，则生成 UUID。

之后：

- `req.requestId` 可供后续中间件和错误处理使用。
- 响应头会写回 `X-Request-Id`。
- 请求日志和错误日志都会记录 requestId。

这样前端、网关、后端日志可以串起来排查问题。

## CORS 与 Cookie

`cors({ origin: getCorsOriginOption(), credentials: true })` 允许浏览器携带 Cookie。

配置规则：

- 开发和测试环境如果未设置 `CORS_ORIGINS`，默认允许任意来源。
- 生产环境如果未设置 `CORS_ORIGINS`，跨域请求会被拒绝。
- 跨站 Cookie 场景还需要前端设置 `credentials: "include"`。

## body parser 与 multer

普通 JSON 请求由 Express 解析：

- `express.json({ limit: REQUEST_BODY_LIMIT })`
- `express.urlencoded({ extended: false, limit: REQUEST_BODY_LIMIT })`

multipart 上传请求不由 body parser 解析，而是由 multer 处理：

- 普通图片/头像：`createImageUploadMiddlewares(FileStorage)`
- 大文件分片：`createLargeUploadChunkMiddleware(LargeUploadStorage)`

所以上传接口的中间件顺序非常重要：multer 必须在 controller 前执行。

## Zod 校验

路由中使用：

```ts
validate(schema);
```

校验内容包括：

- `body`
- `query`
- `params`
- `headers`

校验成功后结果写入：

```ts
req.validated;
```

controller 通过 `getValidated<T>(req)` 或类型断言读取校验后的数据，不直接使用原始 `req.body`。

如果路由忘记挂 `validate()`，`getValidated()` 会抛出内部错误。这是故意的，因为缺少校验属于服务端路由配置问题。

## 认证中间件

`authMiddleware` 支持两种 token 来源：

1. `Authorization: Bearer <accessToken>`
2. `access_token` Cookie

优先级：

```text
Bearer token > access_token Cookie
```

Bearer 优先是为了支持移动端、小程序、第三方客户端或前端显式管理 token 的场景。

Cookie 认证适合同站 Web App，但有额外 CSRF 规则：

- `GET`、`HEAD`、`OPTIONS` 不强制 CSRF。
- `POST`、`PATCH`、`PUT`、`DELETE` 等非安全方法必须带 `X-CSRF-Token`。
- Header 值必须与 `csrf_token` Cookie 一致。
- Bearer 认证不受这个 CSRF 规则影响。

## 可选登录中间件

`optionalAuthMiddleware` 适合“登录用户和匿名用户都能访问”的接口。

它的行为：

- 有 token 且有效：写入 `req.user`。
- 无 token：继续匿名请求。
- token 过期、无效或已拉黑：继续匿名请求。

它不做 CSRF 校验，因此不应该用于需要登录保护的写操作。

当前脚手架提供该中间件，但**没有默认挂载示例路由**。公开内容读接口（`/api/v1/content/news`、`/api/v1/content/pricing`）本身无需登录，也不经过 `optionalAuthMiddleware`。

## asyncHandler

Express 4 默认不会自动捕获异步 controller 中 rejected Promise。

项目用 `asyncHandler(controller, failureMessage)` 包住异步 controller：

- 成功时正常返回。
- 抛错时转交 `next(error)`。
- 未知异常会被包装为不对外暴露的 `INTERNAL AppError`，路由默认文案仅写入内部错误。

最终错误统一进入 `errorMiddleware`。

## 统一错误处理

`errorMiddleware` 负责把不同来源的错误统一成响应：

```json
{ "code": 400, "message": "请求参数错误", "data": null }
```

特殊处理：

- Multer 错误：`LIMIT_FILE_SIZE`、`LIMIT_FILE_COUNT`、`LIMIT_UNEXPECTED_FILE` 转成上传相关中文文案，返回 400。
- 图片类型守卫：multer `fileFilter` 抛出的「仅支持 jpeg…」错误直接原样返回 400。
- `AppError`：按 BAD_REQUEST、UNAUTHORIZED、FORBIDDEN、NOT_FOUND、CONFLICT、GONE、INTERNAL 映射状态码；`expose: false` 的错误只返回统一文案。
- Sequelize 未被业务 Service 转换的唯一键冲突：返回通用 `409 资源已存在`。
- 未知错误：返回统一 500，详细错误只写日志。
- 响应头已发送（例如静态文件或流式响应途中出错）：直接 `next(error)` 交给 Express 默认处理，不再改写响应。

这套机制避免内部错误细节泄露给客户端。

## 响应格式

成功响应：

```json
{
  "code": 200,
  "message": "ok",
  "data": null
}
```

带业务数据时，字段放在 `data` 内：

```json
{
  "code": 200,
  "message": "获取当前用户成功",
  "data": {
    "user": {
      "id": 1,
      "username": "demo",
      "avatar": null,
      "nickname": null
    }
  }
}
```

失败响应：

```json
{
  "code": 401,
  "message": "未登录或无效登录凭证",
  "data": null
}
```

## 探针不走统一信封

`/health` 与 `/ready` 由 `src/routes/health.routes.ts` 直接 `res.json()`，**不**使用 `success()` / `fail()`：

```json
{ "status": "ok" }
```

```json
{ "status": "ready", "checks": { "mysql": "ok", "redis": "disabled" } }
```

依赖不可用时返回 `503`，body 里多一个 `message` 说明哪个依赖失败。它们也挂在全局限流之前，避免健康检查被真实流量挤出限流窗口。

## 请求日志

`httpRequestLogMiddleware` 在响应结束后记录：

- requestId
- userId
- routePath
- method
- url
- statusCode
- durationMs
- ip
- userAgent

`routePath` 使用路由模板，而不是原始 URL。这样日志不会因为不同的 `uploadId`、用户 ID 或查询参数产生过高基数。

## 404 处理

所有未匹配路由会进入：

```ts
next(notFound("接口不存在"));
```

再由 `errorMiddleware` 输出统一响应。

这保证项目中没有 Express 默认 HTML 404 页面。
