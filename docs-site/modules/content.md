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
    HTTP 层：解析 locale、调用 service、把空返回值映射为 404/409

  content.service.ts
    locale 解析、本地化映射，并在写操作成功后触发 ContentRevalidator

  content.data.ts
    新闻文章 hardcoded 数据源

  pricing.data.ts
    定价页 hardcoded 数据源

  index.ts
    模块公开入口：createContentModule() 接收两个 Port 并返回 routes/service
```

相关工具：

```text
src/modules/content/ports/
  content-repository.port.ts
  content-revalidator.port.ts
src/infrastructure/content/in-memory-content.repository.ts
src/infrastructure/revalidation/nuxt-content-revalidator.ts
  新闻变更后通知 Nuxt 清除 SWR 页面缓存
```

公开内容模块当前不包含 `*.model.ts`，也不会在 `src/db/models.ts` 中注册数据库模型。它是进程内数据源示例，适合前端联调和脚手架演示；接入 CMS 或 MySQL 时，实现一个新的 `ContentRepository` Adapter 并在 `src/runtime.ts` 替换即可，`content.service.ts` 和 HTTP 契约都不需要改。

## 对外接口

| 方法     | 路径                      | 鉴权  | 说明                 |
| -------- | ------------------------- | ----- | -------------------- |
| `GET`    | `/api/content/news`       | 否    | 本地化新闻列表       |
| `GET`    | `/api/content/news/:slug` | 否    | 本地化新闻详情       |
| `GET`    | `/api/content/pricing`    | 否    | 本地化定价页内容     |
| `POST`   | `/api/content/news`       | admin | 创建新闻（内存写入） |
| `PATCH`  | `/api/content/news/:slug` | admin | 更新新闻（内存写入） |
| `DELETE` | `/api/content/news/:slug` | admin | 删除新闻（内存删除） |

读接口公开访问；写接口（`POST` / `PATCH` / `DELETE`）挂 `authMiddleware` + `requireAdmin` 两层。

只校验「已登录」是不够的：这些接口改的是所有匿名访客都会看到的公开内容，不是调用者自己的资源，
只挂认证等于任何人注册一个账号就能删掉全站新闻。普通登录账号访问写接口会拿到 `403 需要管理员权限`。

角色存在 `Users.role`（`user` / `admin`，默认 `user`），由授权中间件**每次请求现查**——
从 JWT 读的话，撤销管理员之后他手上的 access token 还能当管理员用到过期为止。

全新部署里没有任何管理员，写接口对所有人关闭。授予方式：

```bash
pnpm db:grant-admin <username>
```

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
- 适合前端联调与脚手架演示；生产 CMS 或数据库接入时，应替换 `ContentRepository` Adapter，尽量保持路由契约不变。

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

创建、更新、删除新闻成功后，`content.service.ts` 会调用注入的 `ContentRevalidator`：

```text
revalidator.revalidateNews(slug)
```

当前 Adapter 是 `src/infrastructure/revalidation/nuxt-content-revalidator.ts`，它用 `getNewsRevalidatePaths(slug)` 展开路径后向 Nuxt 发送：

```text
POST {NUXT_REVALIDATE_URL}
Header: x-revalidate-secret: {REVALIDATE_SECRET}
Body: { "paths": ["/news", "/news/{slug}", "/en/news", "/en/news/{slug}"] }
```

配置来自环境变量：

| 变量                  | 说明                                       |
| --------------------- | ------------------------------------------ |
| `NUXT_REVALIDATE_URL` | Nuxt revalidate 接口地址；未配置则静默跳过 |
| `REVALIDATE_SECRET`   | 与前端约定的密钥；未配置则静默跳过         |

两者只要有一个缺失，Adapter 就直接返回、不发请求也不写日志。只有请求发出后失败（非 2xx 或异常）才会记 `revalidate_failed` warning，且不影响新闻写接口本身的成功响应。

## 与前端协作

`nuxt-modern-starter` 公开站新闻页与定价页通过这些接口拉取本地化内容；新闻变更后依赖 revalidate 清 SWR 缓存。

本地联调时，`.env.development` 通常包含：

```env
NUXT_REVALIDATE_URL=http://localhost:3000/api/revalidate
REVALIDATE_SECRET=dev_revalidate_secret_replace_with_random_string
```

## 测试现状

`tests/integration/content.integration.test.ts` 覆盖公开读接口、本地化解析、未知 slug 404、登录后新闻创建/更新/删除，以及 revalidate 请求体中的中英文新闻列表和详情路径。`tests/unit/infrastructure/revalidation.test.ts` 覆盖 Nuxt Adapter 的路径、请求和未配置跳过逻辑。

密钥需与前端一致。

## 常见扩展方式

### 换成数据库或 CMS

建议：

1. 保留现有路由与响应 envelope。
2. 新增一个实现 `ContentRepository` 的 Adapter（数据库或 CMS），替换 `createInMemoryContentRepository()`。
3. 在 `src/runtime.ts` 注入新 Adapter；`revalidateNews` 的触发逻辑留在 service，不需要改。
4. 同步 OpenAPI 与集成测试。

### 增加更多公开页内容

可按同样模式增加例如 FAQ、帮助中心等只读接口：hardcoded 起步，再替换数据源。
