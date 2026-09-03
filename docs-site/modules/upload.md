# 上传模块

上传模块位于 `src/modules/upload/`，包含普通图片上传、头像/资料图上传和大文件分片上传。

模块内只保留 HTTP、校验和 Port：普通图片上传依赖 `FileStorage`，大文件上传依赖 `LargeUploadStorage`。本地磁盘、分片会话、MD5、合并和秒传实现位于 `src/infrastructure/storage/`，替换对象存储只改组合根。

## 文件职责

```text
src/modules/upload/
  upload.routes.ts
    注册所有上传路由

  image-upload.config.ts
    普通图片 multer 配置、图片类型和数量限制

  image-upload.controller.ts
    普通图片上传响应

  large-upload.constants.ts
    大文件上传容量常量

  large-upload.schema.ts
    大文件上传 Zod schema

  large-upload.multer.ts
    分片上传 multer 配置

  large-upload.controller.ts
    大文件上传 HTTP 控制器

  ports/file-storage.port.ts
    FileStorage Port：上传根目录、目录初始化、绝对路径转公开 URL

  ports/large-upload-storage.port.ts
    LargeUploadStorage Port：分片目录解析、init/status/chunk/merge/abort

  index.ts
    模块公开入口：只导出 createUploadRoutes 和两个 Port 类型

src/infrastructure/storage/
  local-file-storage.adapter.ts
    本地磁盘上传根目录、目录初始化和公开 URL 转换

  local-large-upload.adapter.ts
    分片会话、meta、完成标记、MD5 校验、合并与秒传索引的本地实现
```

## 上传路由

所有上传接口都需要登录。

路由中间件顺序遵循：

```text
authMiddleware
  -> validate(schema)       # 大文件接口
  -> multer                 # multipart 文件落盘
  -> asyncHandler(controller)
  -> service
```

普通图片上传没有额外 Zod body，因为 multipart 文件由 multer 读取；大文件的 init、status、chunk、merge、delete 都会先经过 Zod 校验。chunk 接口尤其重要：`uploadId` 和 `chunkIndex` 必须在 multer 落盘前校验通过，multer 的同步 `destination`/`filename` 回调才能安全地据此解析目录和文件名。

普通上传：

- `POST /api/v1/uploads`
- `POST /api/v1/uploads/profiles`

大文件上传：

- `POST /api/v1/uploads/large/init`
- `GET /api/v1/uploads/large/:uploadId/status`
- `PUT /api/v1/uploads/large/:uploadId/chunks/:chunkIndex`
- `POST /api/v1/uploads/large/:uploadId/merge`
- `DELETE /api/v1/uploads/large/:uploadId`

## 静态资源访问

上传根目录：

```text
uploads/
```

`src/app.ts` 中挂载：

```text
/uploads -> express.static(uploadsRoot)
```

所以落盘文件会通过 `/uploads/...` 公开访问。

## 普通图片上传

### 通用图片

接口：

```text
POST /api/v1/uploads
```

表单字段：

```text
files
```

限制：

- 最多 9 个文件。
- 单文件最大 8MB。
- 只允许 `jpeg/png/gif/webp`。

落盘目录：

```text
uploads/common/<年>/<月>/
```

响应返回：

```json
{
  "code": 200,
  "message": "上传成功",
  "data": {
    "urls": ["/uploads/common/2026/07/xxx.webp"]
  }
}
```

### 头像/资料图

接口：

```text
POST /api/v1/uploads/profiles
```

限制：

- 单次最多 1 个文件。
- 单文件最大 8MB。
- 只允许 `jpeg/png/gif/webp`。

落盘目录：

```text
uploads/profiles/<年>/<月>/
```

上传成功后，前端通常会把返回 URL 通过 `PATCH /api/v1/me/profile` 的 `avatar` 字段写入 `Users.avatar`。

## 文件名策略

普通上传文件名格式：

```text
<timestamp>-<random-hex><safe-ext>
```

扩展名只保留白名单：

- `.jpg`
- `.jpeg`
- `.png`
- `.gif`
- `.webp`

这样可以降低原始文件名带来的路径或特殊字符风险。

## 大文件上传适用场景

大文件分片上传适合：

- 视频
- 压缩包
- 大 PDF
- 素材文件
- 网盘类业务

当前单文件最大：

```text
1024MB
```

单片大小限制：

- 最小 1MB
- 最大 8MB

最大分片数：

```text
2000
```

## 大文件上传总流程

```text
1. POST /api/v1/uploads/large/init
   创建上传任务，或命中 MD5 秒传

2. PUT /api/v1/uploads/large/:uploadId/chunks/:chunkIndex
   上传单个分片，字段名 chunk，Header 带 X-Chunk-Md5

3. GET /api/v1/uploads/large/:uploadId/status
   查询已经收到且大小正确的分片下标

4. POST /api/v1/uploads/large/:uploadId/merge
   合并所有分片，校验整文件 MD5 和大小

5. DELETE /api/v1/uploads/large/:uploadId
   取消上传任务并清理临时分片
```

## init 阶段

请求体：

```json
{
  "fileName": "video.mp4",
  "fileSize": 104857600,
  "chunkSize": 4194304,
  "mimeType": "video/mp4",
  "fileMd5": "32位十六进制md5"
}
```

服务端会：

1. 校验文件大小、分片大小、分片数量和 MD5。
2. 查询全局 MD5 秒传索引。
3. 如果索引命中且文件还存在，直接返回 `instant: true`。
4. 如果未命中，创建 uploadId。
5. 创建临时分片目录。
6. 写入 uploadId 到 fileMd5 的 session 文件。
7. 写入 `meta.json`。

返回两种情况：

秒传：

```json
{
  "instant": true,
  "publicUrl": "/uploads/large/2026/07/file.mp4",
  "chunkTotal": 0,
  "expiresAt": "..."
}
```

需要上传分片：

```json
{
  "instant": false,
  "uploadId": "...",
  "chunkTotal": 25,
  "expiresAt": "..."
}
```

## .data 目录结构

大文件上传会使用 `.data/` 保存会话和索引。

```text
.data/
  large-upload-sessions/
    <uploadId>.json
      保存 uploadId -> fileMd5

  large-upload-hash-index/
    <fileMd5>.json
      保存全局 MD5 秒传索引

  large-upload-done/
    <uploadId>.json
      合并完成后的幂等 marker

  large-upload-chunks/
    <fileMd5>/<uploadId>/
      分片暂存目录与 meta.json
```

为什么 session 文件只保存 `uploadId -> fileMd5`？

因为 multer 的 `destination` 回调是同步函数，不能方便地异步查数据库。项目用 session 文件让 multer 在写入分片前能同步解析目录。

## 临时分片目录

分片临时目录：

```text
.data/large-upload-chunks/<fileMd5>/<uploadId>/
```

其中：

- `fileMd5` 用于按内容聚合。
- `uploadId` 区分同一个文件的不同上传任务。

它放在 `.data/` 而不是 `uploads/`：`uploads/` 整个目录由 `express.static` 无鉴权挂在 `/uploads` 下，
暂存目录一旦落在里面，未合并的分片和含 `userId`、原始文件名的 `meta.json` 都能被匿名下载。
分片是服务端私有状态，和 session、done marker、秒传索引放在一起。

分片文件名：

```text
part-000000.bin
part-000001.bin
part-000002.bin
```

使用固定宽度编号，便于排序和排查。

## 分片上传

接口：

```text
PUT /api/v1/uploads/large/:uploadId/chunks/:chunkIndex
```

表单字段：

```text
chunk
```

请求头：

```http
X-Chunk-Md5: <当前分片的 md5>
```

multer 的 `destination` 回调在写入任何字节之前先解析目录，并在同一步完成归属与状态校验：

- 会话不存在 → 404
- 任务不属于当前用户 → 403
- 任务已过期 → 410
- 任务已完成或正在合并 → 409

这几项必须在这里判定。`destination` 返回后 multer 立刻建流写盘，等 controller 再检查时
字节已经落进别人的目录，403 只是一次事后通知——受害者的分片那时已经被覆写了。

落盘之后 `finalizeChunkWrite()` 复核同一组条件，并额外校验：

- 分片下标是否越界。
- 分片大小是否符合预期。
- 分片 MD5 是否与 header 一致。

任何一条校验不通过都会删掉已经落盘的分片，避免它被后续 status/merge 当成有效分片读到，
也避免被拒绝的请求在磁盘上留下无人回收的垃圾。

## status 阶段

接口：

```text
GET /api/v1/uploads/large/:uploadId/status
```

任务仍在上传中时返回：

- `status`
- `chunkTotal`
- `receivedIndices`
- `fileName`
- `fileSize`
- `chunkSize`

任务已完成时（命中 done marker 或 meta 中已是 `done`）返回：

- `status: "done"`
- `chunkTotal`
- `receivedIndices: []`
- `publicUrl`

`receivedIndices` 只包含大小正确的分片。损坏、未写完或大小不匹配的分片不会返回给客户端。

如果任务已经合并完成且临时目录被清理，服务会读取 done marker 返回完成状态，因此客户端重复轮询是安全的。

## merge 阶段

接口：

```text
POST /api/v1/uploads/large/:uploadId/merge
```

服务端会：

1. 检查 done marker，若已完成则幂等返回。
2. 读取 meta（读取失败时再查一次 marker，覆盖「刚好合并完成并清理」的竞争态）。
3. 校验任务归属。
4. 若 meta 中已是 `done` 且有 `publicUrl`，同样幂等返回。
5. 校验任务未过期。
6. 如果状态是 `merging` 且这把锁还在有效期内（30 分钟），返回 409；
   超时未完成说明上一个持锁进程已经崩溃，允许本次重新合并，否则一次崩溃就会让该任务永远卡在 409。
7. 检查所有分片是否存在且大小正确。
8. 将状态写为 `merging`。
9. 按分片顺序写入临时文件 `<最终文件名>.part`。
10. 同时计算整文件 MD5。
11. 校验整文件 MD5 和大小；任一不符就删除临时文件、把 meta 标记为 `failed` 并抛错。
12. rename 成最终文件。
13. 写入 done marker。
14. 写入全局 MD5 秒传索引。
15. 清理临时分片目录和 session。

最终文件目录：

```text
uploads/large/<年>/<月>/
```

## 取消上传

接口：

```text
DELETE /api/v1/uploads/large/:uploadId
```

行为：

- meta 读不到（任务不存在或已清理）：删掉可能残留的 session，直接返回成功，便于客户端重试。
- 任务属于他人：返回 `403 无权访问该上传任务`。
- 任务已经是 `done`：不做任何事，也不会删掉已合并的最终文件。
- 其余情况：删除临时分片目录和 session。

## 任务有效期

上传任务的存活时间由 `UPLOAD_TEMP_RETENTION_HOURS`（默认 24 小时）决定，`init` 返回的 `expiresAt` 就是这个截止时间。

它和清理任务共用同一个配置项，而不是各写一个常量：两个数字描述同一段寿命时，
运维只调其中一个就会出现「任务还没过期但分片已被清走」或者「分片还在但任务已判过期」的错位。

`status`、`chunk`、`merge` 都会用 `meta.createdAt` 检查是否超时；超时后返回 `410 上传任务已过期，请重新发起`，客户端需要重新 `init`。

已经合并完成的任务不受此限制：done marker 与最终文件不会因为过期而失效，只有临时分片目录需要按运维策略清理。

## merging 状态的作用

当前实现没有分布式锁。`merging` 状态用于阻止同一个 uploadId 在单实例内并发合并。

这把锁带 30 分钟超时（`mergingStartedAt`）。持锁进程可能在合并中途被杀掉，
没有超时的话这把文件锁永远不会释放，该任务此后每次 merge/chunk 都只能拿到 409 ——
即「进程崩过一次，这个上传就废了」。超时后允许重新合并。

这不是分布式锁。如果未来部署多实例，需要把会话、状态和锁迁移到共享基础设施，比如：

- Redis
- 数据库
- 对象存储 multipart 上传状态

## 秒传索引

全局 MD5 索引记录：

- 文件大小
- 公开 URL
- 合并时间
- 首个上传用户 ID

init 阶段如果发现相同 MD5 且文件仍存在，就直接返回已有 URL。

注意：当前秒传索引不承载权限模型，只记录公开 URL。它适合公开上传资源或同一应用内去重，不适合私有文件隔离场景。

## 路径安全

秒传索引来自本地 JSON 文件，但服务仍会校验：

- URL 必须以 `/uploads/` 开头。
- 路径段不能包含 `..`。
- 解析后的绝对路径不能逃逸 `uploadsRoot`。
- 文件必须存在且大小匹配。

如果索引指向坏文件，会删除索引，避免持续返回坏链接。

## 当前限制

当前实现适合单实例。

多实例部署前必须重新设计：

- `uploads/` 文件存储。
- `.data/` 会话文件。
- 合并并发控制。
- 秒传索引。
- 临时分片清理任务。

推荐方向：

- 小规模单机：保留当前实现。
- 多实例：新增真实对象存储实现，如 S3、OSS、MinIO，并同步迁移大文件上传会话与秒传索引。
- 大规模视频/素材业务：使用对象存储 multipart 能力，不建议自己维护所有分片状态。
