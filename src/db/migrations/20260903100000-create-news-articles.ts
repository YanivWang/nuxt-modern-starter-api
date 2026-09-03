/**
 * 文件职责：建 NewsArticles 表，并把此前硬编码在 content.data.ts 里的四篇新闻写进去。
 *
 * 之前公开内容由进程内数组承载：POST/PUT/DELETE 改的是模块级变量，
 * 重启即丢、多实例各看各的、缓存失效 webhook 通知的是别人不知道的变更。
 * 它有写接口、有管理员鉴权、有 revalidate 回调，行为却不是持久化的。
 *
 * 种子数据在这里内联而不是 import content.data.ts：迁移是某一时刻的结构快照，
 * 引用会随重构变化的应用代码，会让「重放同一条迁移得到同一结果」不再成立。
 *
 * createdAt 按数组次序递减：原实现 createNews 用 unshift，数组首位是最近添加的一篇。
 * 列表排序 publishedAt DESC, createdAt DESC 要复现这一点，首位就得有最大的 createdAt。
 */
import { DataTypes } from "sequelize";

import type { QueryInterface } from "sequelize";
import type { MigrationFn } from "umzug";

interface SeedArticle {
  slug: string;
  title: Record<string, string>;
  description: Record<string, string>;
  body: Record<string, string[]>;
  publishedAt: string;
}

const SEED_ARTICLES: SeedArticle[] = [
  {
    slug: "starter-release",
    title: {
      "zh-CN": "Nuxt Modern Starter v0.1 正式发布",
      "en-US": "Nuxt Modern Starter v0.1 is officially ready",
    },
    description: {
      "zh-CN": "首个公开版本聚焦营销页、内容页、SEO、多语言与可选鉴权，为 SaaS 官网与产品前台提供完整起点。",
      "en-US":
        "The first public release focuses on marketing pages, content hubs, SEO, i18n, and optional auth for SaaS websites and product frontends.",
    },
    body: {
      "zh-CN": [
        "Nuxt Modern Starter v0.1 的目标，是把公开站点最常见的能力整理成一套可直接运行的 Nuxt 4 工程骨架。除了首页、价格、帮助和新闻等营销与内容页面，项目还预置 sign-in、sign-up、账户页，以及 `/app/workspace`、`/app/workspace/:projectId/edit`、`/app/account` 等产品区示例。",
        "在工程层面，starter 统一了 localePath、usePageSeo、useTheme 与场景化 API client。公开页默认中文无前缀、英文挂载在 /en 下；登录后产品区统一使用语言中性 URL，并附带 canonical、hreflang、OG 元数据与新闻 Article JSON-LD。",
        "如果你正在评估一个 SaaS 官网或产品前台模板，可以从 README 的 Quick Start 开始，30 分钟内完成本地启动，再按 docs/usage.md 逐步替换文案、内容与后端接口。",
      ],
      "en-US": [
        "Nuxt Modern Starter v0.1 organizes the most common public-site capabilities into a runnable Nuxt 4 foundation. Beyond marketing and content pages such as home, pricing, help, and news, it also ships sign-in, sign-up, account pages, and product routes such as `/app/workspace`, `/app/workspace/:projectId/edit`, and `/app/account`.",
        "On the engineering side, the starter standardizes localePath, usePageSeo, useTheme, and scenario-specific API clients. Public pages use unprefixed Chinese routes and `/en` for English, while logged-in product routes stay language-neutral. SEO covers canonical, hreflang, OG metadata, and Article JSON-LD for news detail pages.",
        "If you are evaluating a SaaS website or product frontend template, start with the README quick start to run locally within 30 minutes, then follow docs/usage.md to replace copy, content, and backend integrations step by step.",
      ],
    },
    publishedAt: "2026-07-04",
  },
  {
    slug: "deployment-guide",
    title: {
      "zh-CN": "默认部署路径：Node server + Docker + Nginx",
      "en-US": "Default deployment path: Node server, Docker, and Nginx",
    },
    description: {
      "zh-CN":
        "项目以 Nitro node-server 为默认部署形态，并提供 Docker 镜像与 Nginx 反向代理样例，方便团队验证自托管上线流程。",
      "en-US":
        "The starter defaults to Nitro node-server deployment and includes Docker and Nginx reverse-proxy samples for self-hosted rollout validation.",
    },
    body: {
      "zh-CN": [
        "Nuxt Modern Starter 的生产部署默认走 Nitro node-server，而不是静态导出。这样可以保留 SSR、routeRules 与新闻页的 SWR 缓存策略，更适合内容会变化的公开站点。",
        "仓库内提供 docker/Dockerfile 与 docker-compose 样例，可通过 pnpm docker:build 与 pnpm docker:run 快速验证镜像构建与容器启动。Nginx 配置位于 docker/nginx/gateway.docker.conf，建议为 /_nuxt/ 静态资源开启长缓存，以减轻 Node 进程压力。",
        "安全方面，生产环境变量应通过容器运行时或平台注入，镜像构建阶段不会复制真实 .env 文件。完整验证步骤可参考 docs/deployment.md。",
      ],
      "en-US": [
        "Nuxt Modern Starter defaults to Nitro node-server deployment instead of static export. That keeps SSR, routeRules, and SWR caching for news pages, which fits public sites whose content changes over time.",
        "The repo includes docker/Dockerfile and docker-compose samples. Use pnpm docker:build and pnpm docker:run to validate image build and container startup. The Nginx config in docker/nginx/gateway.docker.conf should long-cache /_nuxt/ assets to reduce pressure on the Node process.",
        "For security, inject production environment variables at runtime through the platform or container orchestrator. Real .env files are not copied into the image during build. See docs/deployment.md for the full validation flow.",
      ],
    },
    publishedAt: "2026-07-04",
  },
  {
    slug: "i18n-routing",
    title: {
      "zh-CN": "多语言路由设计：默认中文 + /en 英文前缀",
      "en-US": "i18n routing design: default Chinese plus /en English prefix",
    },
    description: {
      "zh-CN": "项目采用默认语言无前缀、次要语言带前缀的路由策略，并统一 localePath 与 hreflang 生成规则。",
      "en-US":
        "The starter uses unprefixed default-locale routes, prefixed secondary locales, and shared localePath and hreflang rules.",
    },
    body: {
      "zh-CN": [
        "Nuxt Modern Starter 默认以 zh-CN 作为站点主语言，因此首页、价格、帮助和新闻等公开页直接使用 /、/pricing 这类无前缀路径。英文内容则统一挂载在 /en 前缀下，例如 /en/pricing 与 /en/news/starter-release。",
        "登录后的产品区不走语言前缀，而是统一使用 /app/workspace、/app/workspace/:projectId/edit、/app/account 这类语言中性 URL。若用户访问 /en/app/workspace 等路径，系统会 301 回到无前缀 canonical，避免产品链接随语言切换而漂移。",
        "语言切换不会简单替换 URL 字符串，而是通过 getSwitchLanguageUrl 与 localePath 保持 query 与 hash。这样用户在切换语言时不会丢失筛选条件或锚点位置，SEO 侧的 hreflang 也能和实际路由一一对应。",
        "扩展第三种语言时，只需在 config/site.ts 注册 locale 与前缀，并补充 i18n 文案与 tests/unit/locale-routing.test.ts 中的断言，避免公开页出现死链或错误 canonical。",
      ],
      "en-US": [
        "Nuxt Modern Starter uses zh-CN as the default site locale, so public pages such as home, pricing, help, and news use unprefixed paths like / and /pricing. English content lives under the /en prefix, for example /en/pricing and /en/news/starter-release.",
        "Logged-in product routes do not use locale prefixes. They stay language-neutral under /app/workspace, /app/workspace/:projectId/edit, and /app/account. If someone opens /en/app/workspace, the app redirects to the canonical path with 301 so product links do not drift with language switches.",
        "Language switching does not blindly rewrite URL strings. getSwitchLanguageUrl and localePath preserve query strings and hash fragments, so users keep filters or anchors when switching languages and hreflang stays aligned with real routes.",
        "To add a third locale, register it in config/site.ts with its prefix, add i18n messages, and extend tests/unit/locale-routing.test.ts so public pages do not produce broken links or incorrect canonical URLs.",
      ],
    },
    publishedAt: "2026-07-03",
  },
  {
    slug: "auth-module",
    title: {
      "zh-CN": "可选鉴权模块：从示例流程到真实后端",
      "en-US": "Optional auth module: from sample flow to real backend",
    },
    description: {
      "zh-CN":
        "登录、注册、账户页、工作台与编辑器已接入 nuxt-modern-starter-api，可在本地完成项目创建、删除、文档加载与自动保存。",
      "en-US":
        "Login, register, account, workspace, and editor flows are wired to nuxt-modern-starter-api for local project creation, deletion, document load, and autosave.",
    },
    body: {
      "zh-CN": [
        "鉴权能力在 Nuxt Modern Starter 中是“可选模块”而非强制依赖。默认提供 sign-in、sign-up、退出和 `/app/account` 示例，并通过命名 auth 中间件保护产品路由，支持基于角色与 permissions 的访问控制。",
        "接入 nuxt-modern-starter-api 后，工作台 `/app/workspace` 会调用真实项目 API；当前只有「新建空白 PPT」卡片和顶部创建按钮会触发 `POST /api/projects`，AI/导入卡片仍是占位 UI。创建项目后进入 `/app/workspace/:projectId/edit` 编辑：该页先用 `GET /api/projects/:projectId` 取到 `documentId`，再通过 `GET/PATCH /api/documents/:documentId` 加载并自动保存文档。请求统一走 `{ code, message, data }` 响应格式，401 时自动 refresh 并重试一次。",
        "如果项目暂时不需要账号体系，也可以保留公开页与内容中心，先不启用 auth 相关导航入口，等业务工作台准备好后再逐步接入。",
      ],
      "en-US": [
        "Auth in Nuxt Modern Starter is an optional module, not a hard dependency. The starter ships sign-in, sign-up, logout, and `/app/account` examples, plus a named auth middleware that protects product routes with role and permission checks.",
        "When paired with nuxt-modern-starter-api, `/app/workspace` calls real project APIs. Only the blank PPT card and the primary create button currently trigger `POST /api/projects`; AI/import cards remain placeholder UI. After creating a project, `/app/workspace/:projectId/edit` first calls `GET /api/projects/:projectId` for its `documentId`, then loads and autosaves through `GET/PATCH /api/documents/:documentId`. Requests use the `{ code, message, data }` envelope and retry once after refresh on 401.",
        "If you do not need accounts yet, keep the public and content pages first and hide auth navigation until the product workspace is ready to connect.",
      ],
    },
    publishedAt: "2026-07-02",
  },
];

/** 种子行之间拉开 1 秒，保证 createdAt DESC 的次序是确定的。 */
const SEED_BASE_TIME = new Date("2026-07-04T12:00:00Z").getTime();
const SEED_STEP_MS = 1000;

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.createTable("NewsArticles", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    slug: {
      type: DataTypes.STRING(120),
      allowNull: false,
      comment: "对外的文章标识，路由与缓存失效路径都用它",
    },
    title: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: '按 locale 存的标题，形如 { "zh-CN": ..., "en-US": ... }',
    },
    description: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    body: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: "按 locale 存的正文段落数组",
    },
    // 存字符串而不是 DATEONLY：契约把 publishedAt 定义为不透明字符串，
    // 换成日期类型会在读回时被驱动重新格式化，响应体与 OpenAPI 对不上。
    publishedAt: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  await context.addIndex("NewsArticles", ["slug"], { name: "news_articles_slug_unique", unique: true });
  await context.addIndex("NewsArticles", ["publishedAt", "createdAt"], { name: "news_articles_published_idx" });

  await context.bulkInsert(
    "NewsArticles",
    SEED_ARTICLES.map((article, index) => {
      const timestamp = new Date(SEED_BASE_TIME - index * SEED_STEP_MS);
      return {
        slug: article.slug,
        // JSON 列在迁移里没有模型的类型信息，必须显式序列化，否则驱动会写进 "[object Object]"。
        title: JSON.stringify(article.title),
        description: JSON.stringify(article.description),
        body: JSON.stringify(article.body),
        publishedAt: article.publishedAt,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    }),
  );
};

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.dropTable("NewsArticles");
};
