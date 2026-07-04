# 上传模块

上传模块位于 `src/modules/upload/`，包含普通图片上传、头像/资料图上传和大文件分片上传。

## 文件职责

```text
src/modules/upload/
  upload.routes.ts
    注册所有上传路由

  upload.config.ts
    普通图片 multer 配置、上传根目录、公开 URL 转换

  upload.controller.ts
    普通图片上传响应

  largeUpload.ts
    大文件上传容量常量

  large-upload.schema.ts
    大文件上传 Zod schema

  large-upload.multer.ts
    分片上传 multer 配置

  large-upload.controller.ts
    大文件上传 HTTP 控制器

  large-upload.service.ts
    分片会话、状态、合并、秒传索引、清理逻辑
```

## 上传路由

所有上传接口都需要登录。

普通上传：

- `POST /api/uploads`
- `POST /api/uploads/profiles`

大文件上传：

- `POST /api/uploads/large/init`
- `GET /api/uploads/large/:uploadId/status`
- `PUT /api/uploads/large/:uploadId/chunks/:chunkIndex`
- `POST /api/uploads/large/:uploadId/merge`
- `DELETE /api/uploads/large/:uploadId`

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
POST /api/uploads
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
  "msg": "上传成功",
  "urls": ["/uploads/common/2026/07/xxx.webp"]
}
```

### 头像/资料图

接口：

```text
POST /api/uploads/profiles
```

限制：

- 单次最多 1 个文件。
- 单文件最大 8MB。
- 只允许 `jpeg/png/gif/webp`。

落盘目录：

```text
uploads/profiles/<年>/<月>/
```

上传成功后，前端通常会把返回 URL 写入 `PATCH /api/me/profile` 的 `avatar` 字段。

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
1. POST /api/uploads/large/init
   创建上传任务，或命中 MD5 秒传

2. PUT /api/uploads/large/:uploadId/chunks/:chunkIndex
   上传单个分片，字段名 chunk，Header 带 X-Chunk-Md5

3. GET /api/uploads/large/:uploadId/status
   查询已经收到且大小正确的分片下标

4. POST /api/uploads/large/:uploadId/merge
   合并所有分片，校验整文件 MD5 和大小

5. DELETE /api/uploads/large/:uploadId
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
```

为什么 session 文件只保存 `uploadId -> fileMd5`？

因为 multer 的 `destination` 回调是同步函数，不能方便地异步查数据库。项目用 session 文件让 multer 在写入分片前能同步解析目录。

## 临时分片目录

分片临时目录：

```text
uploads/chunks-temp/<fileMd5>/<uploadId>/
```

其中：

- `fileMd5` 用于按内容聚合。
- `uploadId` 区分同一个文件的不同上传任务。

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
PUT /api/uploads/large/:uploadId/chunks/:chunkIndex
```

表单字段：

```text
chunk
```

请求头：

```http
X-Chunk-Md5: <当前分片的 md5>
```

multer 先把分片写入磁盘，然后 `finalizeChunkWrite()` 校验：

- 当前用户是否拥有该上传任务。
- 任务是否过期。
- 任务是否正在合并或已完成。
- 分片下标是否越界。
- 分片大小是否符合预期。
- 分片 MD5 是否与 header 一致。

如果大小或 MD5 校验失败，会主动删除已经落盘的坏分片，避免后续 status 或 merge 误用。

## status 阶段

接口：

```text
GET /api/uploads/large/:uploadId/status
```

返回：

- `status`
- `chunkTotal`
- `receivedIndices`
- `fileName`
- `fileSize`
- `chunkSize`
- `publicUrl`，如果已完成

`receivedIndices` 只包含大小正确的分片。损坏、未写完或大小不匹配的分片不会返回给客户端。

如果任务已经合并完成且临时目录被清理，服务会读取 done marker 返回完成状态。

## merge 阶段

接口：

```text
POST /api/uploads/large/:uploadId/merge
```

服务端会：

1. 检查 done marker，若已完成则幂等返回。
2. 读取 meta。
3. 校验任务归属。
4. 校验任务未过期。
5. 如果状态是 `merging`，返回 409。
6. 检查所有分片是否存在且大小正确。
7. 将状态写为 `merging`。
8. 按分片顺序写入临时最终文件。
9. 同时计算整文件 MD5。
10. 校验整文件 MD5 和大小。
11. rename 成最终文件。
12. 写入 done marker。
13. 写入全局 MD5 秒传索引。
14. 清理临时分片目录和 session。

最终文件目录：

```text
uploads/large/<年>/<月>/
```

## merging 状态的作用

当前实现没有分布式锁。`merging` 状态用于阻止同一个 uploadId 在单实例内并发合并。

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
- 多实例：使用对象存储，如 S3、OSS、MinIO。
- 大规模视频/素材业务：使用对象存储 multipart 能力，不建议自己维护所有分片状态。
