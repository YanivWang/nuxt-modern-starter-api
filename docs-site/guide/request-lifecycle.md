# 请求生命周期

理解请求从进入服务到返回响应的全过程，是理解这个项目最有效的方式。

## 一个普通 API 请求如何流动

以 `GET /api/me` 为例：

```text
浏览器 / 客户端
  -> Express app
  -> helmet
  -> cors
  -> requestIdMiddleware
  -> httpRequestLogMiddleware
  -> globalRateLimitMiddleware
  -> compressionMiddleware
  -> express.json / express.urlencoded
  -> userRoutes
  -> authMiddleware
  -> validate(getMeSchema)
  -> asyncHandler(getMe)
  -> user.controller.ts
  -> user.service.ts
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

- 普通图片：`uploadImagesMiddleware`
- 头像图片：`uploadProfileImagesMiddleware`
- 大文件分片：`largeUploadChunkMulter`

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

当前脚手架提供该中间件，但**没有默认挂载示例路由**。公开内容读接口（`/api/content/news`、`/api/content/pricing`）本身无需登录，也不经过 `optionalAuthMiddleware`。

## asyncHandler

Express 4 默认不会自动捕获异步 controller 中 rejected Promise。

项目用 `asyncHandler(controller, failureMessage)` 包住异步 controller：

- 成功时正常返回。
- 抛错时转交 `next(error)`。
- 如果错误本身没有 `failureMessage`，会补充路由默认失败文案。

最终错误统一进入 `errorMiddleware`。

## 统一错误处理

`errorMiddleware` 负责把不同来源的错误统一成响应：

```json
{ "code": 400, "message": "请求参数错误", "data": null }
```

特殊处理：

- Multer 错误：转成上传相关中文文案。
- Sequelize 唯一键冲突：返回 `409 用户名已存在`。
- `createHttpError()` 创建的业务错误：可把 message 暴露给客户端。
- 未知错误：返回统一 500，详细错误只写日志。

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
next(createHttpError(404, "接口不存在"));
```

再由 `errorMiddleware` 输出统一响应。

这保证项目中没有 Express 默认 HTML 404 页面。
