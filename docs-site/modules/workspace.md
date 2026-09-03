# 工作台模块

工作台模块位于 `src/modules/workspace/`，负责默认个人空间、项目列表、项目创建、项目详情查询和项目删除。

## 文件职责

```text
src/modules/workspace/
  workspace.routes.ts
    GET/POST /api/v1/projects、GET/PATCH/DELETE /api/v1/projects/:projectId

  workspace.schema.ts
    创建项目 body、projectId path 的 Zod 校验

  workspace.controller.ts
    HTTP 层：读取 req.user、返回标准 envelope

  workspace.service.ts
    ensurePersonalWorkspace 与 createForUser、listForUser、findForUser、updateForUser、deleteForUser，以及 toProjectDto 映射

  workspace.model.ts
    Workspaces 模型

  project.model.ts
    Projects 模型

  index.ts
    模块公开入口：createWorkspaceModule() 组装 service/controller/router，并再导出 ProjectDto
```

`workspace.model.ts` 和 `project.model.ts` 只定义模型与关联所需字段；模型注册入口在 `src/db/models.ts`。Service 不导入全局模型，而是由 `src/runtime.ts` 注入 `AppDatabase`，再从 `database.models` 取 `Workspace`、`Project`、`Document`，从 `database.sequelize` 开事务。

## 接口

所有接口都需要 `authMiddleware`。

**无独立 Workspace CRUD 端点。** Workspace 在创建项目时由 `ensurePersonalWorkspace()` 内部自动创建（`type = personal`，`(ownerId, type)` 唯一）。

| 方法     | 路径                          | 说明                                        |
| -------- | ----------------------------- | ------------------------------------------- |
| `GET`    | `/api/v1/projects`            | 分页返回当前用户的项目列表                  |
| `POST`   | `/api/v1/projects`            | 创建项目并初始化关联 Document               |
| `GET`    | `/api/v1/projects/:projectId` | 返回当前用户的项目详情                      |
| `PATCH`  | `/api/v1/projects/:projectId` | 更新当前用户的项目标题或描述                |
| `DELETE` | `/api/v1/projects/:projectId` | 删除当前用户的项目，并级联删除关联 Document |

创建项目请求体：

```json
{
  "title": "季度汇报",
  "description": "可选描述"
}
```

字段校验：

- `title`：必填，trim 后 1～160 字符。
- `description`：可选，trim 后最多 500 字符。

## 列表分页

`GET /api/v1/projects` 使用全站统一的 `limit` / `offset` 约定（定义见 `src/shared/http/pagination.ts`）：默认单页 20 条，上限 100，超出范围返回 400。

```json
{
  "code": 200,
  "message": "获取项目列表成功",
  "data": {
    "projects": [],
    "pagination": { "total": 42, "limit": 20, "offset": 0, "hasMore": true }
  }
}
```

服务端使用 `findAndCountAll` 并开启 `distinct`——列表 include 了 `hasOne` 的 Document 关联，不加 `distinct` 时 JOIN 会放大 `count`。

> 该接口此前返回全量列表。项目数会随使用时间单调增长，无上限的查询迟早会拖垮响应与内存，因此改为强制分页。**前端需要读取 `data.projects` 并按 `pagination` 翻页。**

更新项目请求体（`PATCH /api/v1/projects/:projectId`）：

```json
{
  "title": "新标题",
  "description": "可选描述"
}
```

字段校验：

- 至少提供一个字段。
- `title`：可选，trim 后 1～160 字符。
- `description`：可选，trim 后最多 500 字符。

更新成功时返回 `200`，`data` 包含更新后的 `project`。若更新了 `title`，关联 Document 的标题会同步更新。

新建项目默认值：

- `status`：`draft`
- `slideCount`：`0`
- `accent`：`blue`

创建成功时 HTTP 状态为 `201`，业务信封 `code` 为 `200`，`data` 同时包含 `project` 与 `document`：

```json
{
  "code": 200,
  "message": "创建项目成功",
  "data": {
    "project": {
      "id": "uuid",
      "documentId": "uuid",
      "title": "季度汇报",
      "status": "draft",
      "accent": "blue"
    },
    "document": {
      "id": "uuid",
      "projectId": "uuid",
      "title": "季度汇报",
      "content": ""
    }
  }
}
```

删除成功时返回：

```json
{
  "code": 200,
  "message": "删除项目成功",
  "data": null
}
```

## 业务规则

- 每个用户会自动拥有一个 `type = personal` 的默认 Workspace；创建项目时会写入该空间。
- 创建项目时在同一个事务里创建 Project 和 Document。
- 列表、详情、更新与删除都按 `ownerId = req.user.id` 过滤，避免跨用户访问。
- 删除项目只执行 `Project.destroy()`；关联 Document 由 `Documents.projectId` 的外键 `ON DELETE CASCADE` 在数据库层清理。删除成功后 `data` 为 `null`。
- 访问不存在的项目或他人项目时，详情、更新与删除均返回 `404 项目不存在`。
- **DTO 不包含前端路由字段。** 曾经返回过 `editPath` / `previewPath`，但路由表属于前端：这两个字段既无人消费，又在前端改路由后变成了指向不存在页面的错误数据。前端自行由项目 id 拼路径（`getWorkspaceDocPath`）。
- `status` 与 `accent` 在 DTO 中是联合类型而非自由字符串。列存的是文本，出库时会归一化到合法取值——`accent` 会被前端直接拼进 CSS 类名，超集取值会静默渲染成无样式卡片。

## 与前端协作

`nuxt-modern-starter` 通过 `app/api/workspace-project.ts` 调用上述接口：

- `fetchWorkspaceProjects({ limit, offset })` → `GET /api/v1/projects`
- `createWorkspaceProject()` → `POST /api/v1/projects`
- `fetchWorkspaceProject(projectId)` → `GET /api/v1/projects/:projectId`
- `updateWorkspaceProject(projectId)` → `PATCH /api/v1/projects/:projectId`
- `deleteWorkspaceProject(projectId)` → `DELETE /api/v1/projects/:projectId`

请求经 `createProductApiClient()` 发送 Bearer Token。前端当前只有空白项目卡片和顶部创建按钮会调用 `POST /api/v1/projects`；搜索/筛选 UI 尚未接后端参数。

列表分页由 `useWorkspaceProjects` 承接：第一页走 `useAsyncData`，后续页累积并由「加载更多」按钮驱动，推进逻辑在 `performWorkspaceProjectLoadMore` 中可单测。

本地联调默认配置：

- 前端 `NUXT_PUBLIC_API_BASE=http://localhost:2027/api`
- 后端 `CORS_ORIGINS` 包含 `http://localhost:3000`

## 测试现状

`tests/integration/product-foundation.integration.test.ts` 覆盖项目创建、列表、详情、删除、关联 Document 初始化、删除级联清理，以及跨用户读取/删除隔离。项目 PATCH 逻辑由 service 按 `ownerId` 过滤，当前仍建议在后续补充 PATCH 越权集成断言。
