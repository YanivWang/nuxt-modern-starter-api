# 工作台模块

工作台模块位于 `src/modules/workspace/`，负责默认个人空间、项目列表、项目创建和项目详情查询。

## 文件职责

```text
src/modules/workspace/
  workspace.routes.ts
    GET/POST /api/projects、GET /api/projects/:projectId

  workspace.schema.ts
    创建项目 body、projectId path 的 Zod 校验

  workspace.controller.ts
    HTTP 层：读取 req.user、返回标准 envelope

  workspace.service.ts
    ensurePersonalWorkspace、createProjectForUser、listProjectsForUser、findProjectForUser

  workspace.model.ts
    Workspaces 模型

  project.model.ts
    Projects 模型
```

## 接口

所有接口都需要 `authMiddleware`。

| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| `GET` | `/api/projects` | 返回当前用户的项目列表 |
| `POST` | `/api/projects` | 创建项目并初始化关联 Document |
| `GET` | `/api/projects/:projectId` | 返回当前用户的项目详情 |

创建项目请求体：

```json
{
  "title": "季度汇报",
  "description": "可选描述"
}
```

创建成功时返回 `201`，`data` 同时包含 `project` 与 `document`：

```json
{
  "code": 201,
  "message": "创建项目成功",
  "data": {
    "project": {
      "id": "uuid",
      "documentId": "uuid",
      "editPath": "/app/workspace/{id}/edit",
      "previewPath": "/app/workspace/{id}/preview"
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

## 业务规则

- 每个用户会自动拥有一个 `type = personal` 的默认 Workspace；创建项目时会写入该空间。
- 创建项目时在同一个事务里创建 Project 和 Document。
- 列表与详情查询都按 `ownerId = req.user.id` 过滤，避免跨用户访问。
- `editPath` 与 `previewPath` 是前端路由提示，供 Nuxt 工作台直接跳转。

## 与前端协作

`nuxt-modern-starter` 通过 `app/features/workspace/api.ts` 调用上述接口：

- `fetchWorkspaceProjects()` → `GET /api/projects`
- `createWorkspaceProject()` → `POST /api/projects`
- `fetchWorkspaceProject(projectId)` → `GET /api/projects/:projectId`

请求经 `createProductApiClient()` 发送 Bearer Token。前端当前只有空白项目卡片和顶部创建按钮会调用 `POST /api/projects`；搜索/筛选 UI 尚未接后端参数。

本地联调默认配置：

- 前端 `NUXT_PUBLIC_API_BASE=http://localhost:2026/api`
- 后端 `CORS_ORIGINS` 包含 `http://localhost:3000`
