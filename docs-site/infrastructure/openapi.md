# OpenAPI 与 Swagger

项目把运行时接口校验和接口文档尽量放在同一条链路上维护，避免“接口变了，文档没变”。

## 文件职责

```text
src/openapi.ts
  生成 OpenAPI 3.1 spec 和 YAML 字符串

src/swagger.ts
  挂载 /api-docs 和 /openapi.yaml

scripts/generate-openapi.ts
  写入或校验 docs/openapi.yaml

docs/openapi.yaml
  生成物，供外部工具或文档平台读取

src/openapi.test.ts
  验证 OpenAPI schema 复用 Zod，并检查 docs/openapi.yaml 是否同步
```

## 为什么从源码生成文档

项目中的请求校验基于 Zod。OpenAPI 也复用这些 Zod schema。

好处：

- 路由校验和文档描述来自同一份规则。
- 减少重复维护。
- CI 可以检查文档是否过期。

## Zod 到 OpenAPI

`src/openapi.ts` 使用：

```ts
z.toJSONSchema(schema, { io: "input" });
```

将 Zod schema 转成 JSON Schema。随后移除 `$schema` 这类 OpenAPI 不需要的元信息。

例如注册接口：

```text
registerSchema.shape.body
  -> zodInputSchema()
  -> jsonRequestBody()
  -> OpenAPI requestBody
```

大文件 init 接口也是同样方式：

```text
largeUploadInitSchema.shape.body
  -> OpenAPI requestBody
```

## 统一响应 schema

OpenAPI components 中声明：

- `SuccessBody`
- `ErrorBody`

成功响应使用 `{ code, message, data }`，业务字段放在 `data` 内。

错误响应使用 `additionalProperties: false`，默认只返回：

```json
{
  "code": 400,
  "message": "请求参数错误",
  "data": null
}
```

## 运行时文档

启动 API 后可以访问：

```text
http://localhost:3000/api-docs
http://localhost:3000/openapi.yaml
```

Docker 网关下：

```text
http://localhost:2026/api-docs
http://localhost:2026/openapi.yaml
```

`/api-docs` 使用 Swagger UI。

`/openapi.yaml` 每次请求都会从 `src/openapi.ts` 生成 YAML。

## 仓库中的 docs/openapi.yaml

`docs/openapi.yaml` 是生成物，不应手写修改。

修改接口后：

```bash
pnpm openapi:generate
```

CI 检查：

```bash
pnpm openapi:check
```

如果 `docs/openapi.yaml` 落后于源码，`openapi:check` 会失败并提示重新生成。

## 新增接口时怎么做

以新增 `GET /api/orders` 为例：

1. 创建或补充 Zod schema。
2. 在对应路由中挂 `validate(schema)`。
3. 在 controller 中读取 `req.validated`。
4. 在 `src/openapi.ts` 的 `paths` 中补充 OpenAPI operation。
5. 运行 `pnpm openapi:generate`。
6. 运行 `pnpm run check`。

不要只改路由不改 OpenAPI，否则 CI 会在 `openapi:check` 或测试阶段暴露问题。

## 当前文档边界

当前 OpenAPI security 只声明 Bearer JWT：

```text
Authorization: Bearer <accessToken>
```

Cookie + CSRF 的 Web App 接入细节在 README 和本文档认证章节说明。

这是有意选择：

- OpenAPI 更适合描述通用 HTTP API 和 Bearer 客户端。
- Cookie + CSRF 涉及浏览器、同站策略、前端读取 Cookie、CORS credentials，需要更长解释。

## 与 VitePress 文档的关系

VitePress 文档讲架构、模块和维护方式。

OpenAPI 讲接口契约：

- URL
- 方法
- 参数
- 请求体
- 响应结构
- Bearer 鉴权

两者互补，不互相替代。

## 测试保障

`src/openapi.test.ts` 覆盖两件事：

1. 请求 schema 是否来自 Zod 校验规则。
2. `docs/openapi.yaml` 是否与运行时生成结果一致。

这让接口文档成为质量门禁的一部分，而不是上线前人工补文档。
