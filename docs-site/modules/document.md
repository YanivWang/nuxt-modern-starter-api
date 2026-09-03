# 文档模块

文档模块位于 `src/modules/document/`，负责编辑器内容的读取与保存。

## 文件职责

```text
src/modules/document/
  document.routes.ts
    GET/PATCH /api/v1/documents/:documentId

  document.schema.ts
    documentId path、保存 body 的 Zod 校验

  document.controller.ts
    HTTP 层：读取 req.user、返回标准 envelope

  document.service.ts
    findForUser、updateForUser

  document.contract.ts
    DocumentDto 与 toDocumentDto()，供 workspace 模块跨模块复用

  document.model.ts
    Documents 模型

  index.ts
    模块公开入口：createDocumentModule()，并再导出 toDocumentDto / DocumentDto
```

`document.model.ts` 定义 Documents 表，注册由 `src/db/models.ts` 统一完成。文档 service 由 `src/runtime.ts` 注入 `AppDatabase`，从 `database.models` 取 `Document`、`Project`，用 `database.sequelize` 开事务，并在事务中保持文档标题与项目标题同步。

## 接口

所有接口都需要 `authMiddleware`。

| 方法    | 路径                            | 说明             |
| ------- | ------------------------------- | ---------------- |
| `GET`   | `/api/v1/documents/:documentId` | 读取当前用户文档 |
| `PATCH` | `/api/v1/documents/:documentId` | 保存当前用户文档 |

保存请求体字段均为可选：

```json
{
  "title": "文档标题",
  "content": "<p>编辑器 HTML 内容</p>"
}
```

字段校验：

- `title`：若提供，trim 后 1～160 字符。
- `content`：若提供，最大 10,000,000 字符（约 10MB 文本）。

成功响应示例：

```json
{
  "code": 200,
  "message": "保存文档成功",
  "data": {
    "document": {
      "id": "uuid",
      "projectId": "uuid",
      "title": "文档标题",
      "content": "<p>编辑器 HTML 内容</p>",
      "updatedAt": "2026-07-05T15:00:00.000Z"
    }
  }
}
```

## 业务规则

- 文档与项目是一对一关系，`Documents.projectId` 唯一。
- 读取和保存都按 `ownerId = req.user.id` 过滤；其他用户访问返回 `404`。
- 保存文档时会将 Document 标题写回关联 Project，使项目标题与文档标题保持一致。
- 文档内容当前存储为 LONGTEXT，适合编辑器 HTML；后续可扩展版本历史或协作能力。

## 与前端协作

`nuxt-modern-starter` 通过 `app/apis/editor/document.ts` 调用上述接口：

- `fetchEditorDocument(documentId)` → `GET /api/v1/documents/:documentId`
- `saveEditorDocument(documentId, payload)` → `PATCH /api/v1/documents/:documentId`

前端 `saveEditorDocument()` 会始终提交当前编辑器 `content`；后端 PATCH body 的 `title`/`content` 字段本身都是可选的。

编辑器页面 `/app/workspace/:projectId/edit` 会先 `GET /api/v1/projects/:projectId` 拿到 `documentId`，再加载并保存文档。预览页会对同一文档内容做 HTML 预览（`v-html`），不是 PPT 幻灯片引擎。

独立 deep link 路由 `/app/editor?documentId=...` 也使用该接口，并使用 `editor` layout；未提供 `documentId` 时会重定向到 `/app/workspace`。

## 测试现状

`tests/integration/product-foundation.integration.test.ts` 覆盖通过项目拿到 `documentId` 后读取和保存自己的文档，并验证删除项目后关联 Document 被清理。Cookie 认证下 PATCH 文档的 CSRF 行为仍是当前测试 gap。
