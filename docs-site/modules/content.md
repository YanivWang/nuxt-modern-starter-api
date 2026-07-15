# 公开内容模块

公开内容模块位于 `src/modules/content/`，为 Nuxt 前端营销页提供新闻与定价页数据。读接口无需登录；写接口需要登录。

## 文件职责

```text
src/modules/content/
  content.routes.ts
    注册 /api/content/news、/api/content/pricing 路由

  content.schema.ts
    列表/详情/定价 query、slug、创建与更新 body 的 Zod 校验

  content.controller.ts
    HTTP 层：解析 locale、调用 service、触发 Nuxt revalidate

  content.service.ts
    内存数据读写、locale 解析与本地化映射

  content.data.ts
    新闻文章 hardcoded 数据源

  pricing.data.ts
    定价页 hardcoded 数据源
```

相关工具：

```text
src/utils/revalidate.ts
  新闻变更后通知 Nuxt 清除 SWR 页面缓存
```

## 对外接口

| 方法     | 路径                      | 鉴权 | 说明                 |
| -------- | ------------------------- | ---- | -------------------- |
| `GET`    | `/api/content/news`       | 否   | 本地化新闻列表       |
| `GET`    | `/api/content/news/:slug` | 否   | 本地化新闻详情       |
| `GET`    | `/api/content/pricing`    | 否   | 本地化定价页内容     |
| `POST`   | `/api/content/news`       | 是   | 创建新闻（内存写入） |
| `PATCH`  | `/api/content/news/:slug` | 是   | 更新新闻（内存写入） |
| `DELETE` | `/api/content/news/:slug` | 是   | 删除新闻（内存删除） |

写接口（`POST` / `PATCH` / `DELETE`）挂 `authMiddleware`；读接口公开访问。

## 本地化规则

支持语言：

- `zh-CN`（默认）
- `en-US`

locale 解析顺序（`resolveLocale()`）：

1. query `locale` 若为 `zh-CN` 或 `en-US`，优先使用。
2. 否则看 `Accept-Language`：以 `en` 开头则用 `en-US`。
3. 其余情况回退 `zh-CN`。

列表项返回本地化后的：

- `slug`
- `title`
- `description`
- `publishedAt`

详情额外返回本地化后的 `body`（字符串数组，每段一段正文）。

定价页返回本地化后的页面文案、`plans` 与 `includes`。

## 数据存储边界

当前 starter 阶段使用**进程内内存常量**，不是 MySQL 表：

- 新闻：`content.data.ts` 的 `newsArticles`
- 定价：`pricing.data.ts` 的 `pricingPageContent`

含义：

- 进程重启后，运行时创建/更新/删除的新闻会丢失，回到源码中的初始数据。
- 适合前端联调与脚手架演示；生产 CMS 或数据库接入时，应替换 service 数据源，尽量保持路由契约不变。

## 读接口示例

### 新闻列表

```text
GET /api/content/news?locale=zh-CN
```

成功响应：

```json
{
  "code": 200,
  "message": "获取新闻列表成功",
  "data": {
    "articles": [
      {
        "slug": "starter-release",
        "title": "Nuxt Modern Starter v0.1 正式发布",
        "description": "...",
        "publishedAt": "2026-07-04"
      }
    ]
  }
}
```

### 新闻详情

```text
GET /api/content/news/starter-release
```

未知 slug 返回 `404 新闻不存在`。

### 定价页

```text
GET /api/content/pricing
```

成功响应 `data.pricing` 包含：

- `eyebrow` / `title` / `lead` / `note`
- `plans`：方案列表（含 `key`、`featured`、`ctaPath`、本地化文案与 `features`）
- `includes`：包含项区块

## 写接口

### 创建新闻

```text
POST /api/content/news
Authorization: Bearer <accessToken>
```

请求体：

```json
{
  "slug": "my-news",
  "title": { "zh-CN": "中文标题", "en-US": "English title" },
  "description": { "zh-CN": "中文摘要", "en-US": "English summary" },
  "body": {
    "zh-CN": ["第一段"],
    "en-US": ["First paragraph"]
  },
  "publishedAt": "2026-07-08"
}
```

字段规则：

- `slug`：小写字母、数字与连字符，形如 `a-b-1`。
- `title` / `description`：必须同时提供 `zh-CN` 与 `en-US` 非空字符串。
- `body`：两侧语言各至少一段非空字符串。
- `publishedAt`：非空字符串。

成功时 HTTP 状态为 `201`，业务信封 `code` 为 `200`，`data.article` 为完整双语原文（未按 locale 折叠）。

slug 已存在时返回 `409 新闻 slug 已存在`。

### 更新新闻

```text
PATCH /api/content/news/:slug
```

body 至少提供一个字段：`title`、`description`、`body`、`publishedAt`。

成功时 `data.article` 为更新后的完整双语原文（与创建接口相同，未按 locale 折叠）。

不存在返回 `404 新闻不存在`。

### 删除新闻

```text
DELETE /api/content/news/:slug
```

成功返回 `data: null`；不存在返回 `404`。

## Nuxt 缓存失效

创建、更新、删除新闻成功后，controller 会调用：

```text
revalidateNewsPaths(slug)
```

它会向 Nuxt 发送：

```text
POST {NUXT_REVALIDATE_URL}
Header: x-revalidate-secret: {REVALIDATE_SECRET}
Body: { "paths": ["/news", "/news/{slug}", "/en/news", "/en/news/{slug}"] }
```

配置来自环境变量：

| 变量                  | 说明                                       |
| --------------------- | ------------------------------------------ |
| `NUXT_REVALIDATE_URL` | Nuxt revalidate 接口地址；未配置则跳过     |
| `REVALIDATE_SECRET`   | 与前端约定的密钥；未配置则跳过并打 warning |

revalidate 失败只记日志，不影响新闻写接口本身的成功响应。

## 与前端协作

`nuxt-modern-starter` 公开站新闻页与定价页通过这些接口拉取本地化内容；新闻变更后依赖 revalidate 清 SWR 缓存。

本地联调时，`.env.development` 通常包含：

```env
NUXT_REVALIDATE_URL=http://localhost:3000/api/revalidate
REVALIDATE_SECRET=dev_revalidate_secret_replace_with_random_string
```

密钥需与前端一致。

## 常见扩展方式

### 换成数据库或 CMS

建议：

1. 保留现有路由与响应 envelope。
2. 把 `content.data.ts` / `pricing.data.ts` 换成 repository。
3. 写接口改为持久化，并继续调用 `revalidateNewsPaths`。
4. 同步 OpenAPI 与集成测试。

### 增加更多公开页内容

可按同样模式增加例如 FAQ、帮助中心等只读接口：hardcoded 起步，再替换数据源。
