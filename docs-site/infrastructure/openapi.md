# OpenAPI 与 Swagger

项目把运行时接口校验和接口文档尽量放在同一条链路上维护，避免“接口变了，文档没变”。

## 文件职责

```text
src/openapi.ts
  生成 OpenAPI 3.1 spec 和 YAML 字符串

src/shared/http/api-envelope.ts
  { code, message, data } 成功信封的 schema 构造器

src/modules/<domain>/<domain>.contract.ts
  各模块的响应契约：DTO 类型与 OpenAPI 响应 schema 的唯一来源

src/swagger.ts
  挂载 /api-docs 和 /openapi.yaml

scripts/generate-openapi.ts
  写入或校验 docs/openapi.yaml

docs/openapi.yaml
  生成物，供外部工具或文档平台读取

tests/unit/openapi.test.ts
  验证 OpenAPI schema 复用 Zod、每个业务响应都描述了 payload，并检查 docs/openapi.yaml 是否同步

tests/integration/response-contract.integration.test.ts
  用同一份响应 schema 校验真实 HTTP 响应体
```

注意：测试文件现在统一在顶层 `tests/`，OpenAPI 相关测试不再放在 `src/` 下；`src/` 只保留运行时代码和生成逻辑。

## 为什么从源码生成文档

项目中的请求校验基于 Zod。OpenAPI 也复用这些 Zod schema。

好处：

- 路由校验和文档描述来自同一份规则。
- 减少重复维护。
- CI 可以检查文档是否过期。

## Zod 到 OpenAPI

请求侧用 `io: "input"`：

```ts
z.toJSONSchema(schema, { io: "input" });
```

将 Zod schema 转成 JSON Schema。随后移除 `$schema` / `$id` 这类 OpenAPI 不需要的元信息。

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

响应侧用 `io: "output"`，并且走的是 Zod 注册表模式，这样共用的实体只在 components 里出现一次：

```ts
z.toJSONSchema(responseRegistry, {
  io: "output",
  uri: (id) => `#/components/schemas/${id}`,
});
```

```text
projectDtoSchema (workspace.contract.ts)
  -> z.infer 推导出 ProjectDto，toProjectDto 的返回类型就是它
  -> 注册进 responseRegistry
  -> components.schemas.ProjectDto
  -> ProjectListBody / ProjectBody / ProjectCreatedBody 用 $ref 引用它
```

关键在于中间那一步：文档里的 `ProjectDto` 和 mapper 返回的 `ProjectDto` 是同一个对象推导出来的。
mapper 少写、改名或改类型某个字段都会直接编译失败，不存在「文档写得很完整、实际返回却不是那样」的空间。

## 统一响应 schema

业务接口的成功响应使用 `{ code, message, data }`，业务字段放在 `data` 内。
components 里对应两层：

- 信封层，以 `Body` 结尾，例如 `ProjectListBody`、`DocumentBody`、`NullDataBody`。它们由 `apiEnvelope(dataSchema)` 生成，`code` 是字面量 `200`。
- 数据层，不带后缀，例如 `ProjectDto`、`DocumentDto`、`Pagination`、`LocalizedPricingPage`。被多个信封共用的实体只声明一次，其余位置用 `$ref` 引用。

错误响应用 `ErrorBody`（同样由 Zod 生成），`code` 是 HTTP 状态码而不是恒定的 200。

另外还有不走信封的探针：`HealthBody` / `ReadyBody` / `ReadyChecks`。

## 错误状态码

每个端点声明的是它**真实会返回**的状态码，而不是统一的 400/429/500。
少声明一个状态码和把响应 `data` 写成空对象是同一类问题：契约看着完整，其实没描述真实行为——
照着契约写客户端的人会以为 `GET /api/v1/projects/{projectId}` 永远不会 404。

反向的「多声明一个到不了的状态码」同样有害，所以两头都要夹住：

- `tests/unit/openapi.test.ts` 校验机械可推的部分：挂了鉴权中间件的端点必须声明 401，
  带路径参数的端点必须声明 404（例外要写进 `NO_NOT_FOUND` 并说明理由）。
- `tests/integration/error-contract.integration.test.ts` 逐条触发真实错误，
  校验响应体符合 `ErrorBody`，并断言该状态码在契约里声明过。403、409 这类端点特有的状态码
  只能靠这一层。它还有一条反向断言：**契约声明的每个端点特有状态码都必须能被真的触发**，
  否则就是多声明了一个到不了的状态码——客户端会为一个永远不会发生的情况写处理逻辑。

这一层立刻抓到过一个真实错误：`DELETE /api/v1/uploads/large/{uploadId}` 被按「带路径参数」
的惯例声明了 404，而 `abortLargeUpload` 其实是幂等的——任务不存在时同样返回成功。

历史上所有 200 响应统一引用一个 `data: {}` 的 `SuccessBody`，也就是「请求描述得很完整、响应完全没描述」。
空对象在 JSON Schema 里等价于「任意值」，于是契约只能挡住路径与方法漂移，挡不住字段漂移——
把项目列表从 `{ projects }` 改成 `{ projects, pagination }` 时，两侧都没有任何自动化报警。
`tests/unit/openapi.test.ts` 现在有一条回归守卫，任何业务响应的 `data` 退回空 schema 都会失败。

`/health` 与 `/ready` 是例外：它们不走这个信封，直接返回 `{ status }` 和 `{ status, checks, message? }`，所以在 components 里单独声明，`/ready` 还额外声明了 `503`。

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
http://localhost:2027/api-docs
http://localhost:2027/openapi.yaml
```

`/api-docs` 使用 Swagger UI。

`/openapi.yaml` 每次请求都会从 `src/openapi.ts` 生成 YAML。

## 仓库中的 docs/openapi.yaml

`docs/openapi.yaml` 是生成物，不应手写修改。

修改接口后：

```bash
pnpm openapi:generate
pnpm format
```

`openapi:generate` 输出的是 js-yaml 的原始 YAML 风格，与 Prettier 不同，所以生成后要再跑一次 `pnpm format`，否则 `pnpm format:check` 会失败。`openapi:check` 本身只比较解析后的 spec，不比较文本格式。

CI 检查：

```bash
pnpm openapi:check
```

如果 `docs/openapi.yaml` 落后于源码，`openapi:check` 会失败并提示重新生成。

## 新增接口时怎么做

以新增 `GET /api/orders` 为例：

1. 创建或补充入参 Zod schema。
2. 在对应模块的 `<domain>.contract.ts` 里补响应 schema，并用 `z.infer` 推导 DTO 类型；mapper / service 显式标注这个返回类型。
3. 在对应路由中挂 `validate(schema)`。
4. 在 controller 中通过 `getValidated<T>(req)` 读取 `req.validated`。
5. 在 `src/openapi.ts` 的 `RESPONSE_COMPONENTS` 中登记新 schema，并在 `paths` 中补充 OpenAPI operation（`ok()` 的第三个参数是成功状态码，创建类接口传 `"201"`）。
6. 在 `tests/integration/response-contract.integration.test.ts` 中对新端点的真实响应跑一次契约断言。
7. 运行 `pnpm openapi:generate` 和 `pnpm format`。
8. 运行 `pnpm run check`。

不要只改路由不改 OpenAPI，否则 CI 会在 `openapi:check` 或测试阶段暴露问题。

## 当前文档边界

当前 OpenAPI security 只声明 Bearer JWT：

```text
Authorization: Bearer <accessToken>
```

Cookie + CSRF 的 Web App 接入细节在 README 和 [认证模块](/modules/auth) 说明。

这是有意选择：

- OpenAPI 更适合描述通用 HTTP API 和 Bearer 客户端。
- Cookie + CSRF 涉及浏览器、同站策略、前端读取 Cookie、CORS credentials，需要更长解释。

当前 OpenAPI `paths` 覆盖 `/health`、`/ready` 两个探针，以及认证、当前用户/资料、公开内容（新闻/定价）、项目、文档、普通上传与大文件分片上传这些业务域。

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

`tests/unit/openapi.test.ts` 覆盖：

1. 请求 schema 是否来自 Zod 校验规则。
2. 每个业务响应的 `data` 是否真的描述了形状（回归守卫，防止退回 `data: {}`）。
3. 成功信封的 `code` 是否钉在字面量 200，创建类接口是否用 201 而不是 200。
4. `docs/openapi.yaml` 是否与运行时生成结果一致。

`tests/integration/response-contract.integration.test.ts` 覆盖类型系统够不到的那一段：
它对真实 HTTP 响应体跑一遍同一份响应 schema。少字段或类型不符由 `parse` 抛出；
多字段由「`parse` 后与原始 body 相等」兜住——`z.object` 会静默剥掉未声明的键，
不比对的话 components 里的 `additionalProperties: false` 等于没写。

编译期挡不住的典型场景是 controller 拼信封那一步：把 `{ project }` 写成 `{ projects }`、
或者顺手多塞一个字段，`tsc` 一概不报错，因为 `success()` 的 `data` 参数是 `unknown`。

这让接口文档成为质量门禁的一部分，而不是上线前人工补文档。

## 接口版本

业务接口的路径带 `/api/v1` 前缀，OpenAPI 中记录的就是这一组路径。无版本的 `/api` 别名已下线：同一实现挂两个前缀会让「哪条路径是契约」变得含糊，文档、集成测试与客户端 adapter 都要维护两套说法。破坏性变更改为只通过抬版本号（`/api/v2`）发布。

破坏性变更应通过新增 `/api/v2` 引入，并让两个版本在迁移窗口内并行，而不是原地修改 `/api/v1` 的语义。
