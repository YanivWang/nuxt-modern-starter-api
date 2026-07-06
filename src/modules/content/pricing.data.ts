/**
 * 文件职责：公开定价页内容的 hardcoded 数据源。
 */
import type { SupportedLocale } from "./content.data.js";

export type PricingPlanKey = "starter" | "growth" | "custom";

export type PricingPlan = {
  key: PricingPlanKey;
  featured: boolean;
  ctaPath: "/sign-up" | "/help";
  name: Record<SupportedLocale, string>;
  badge: Record<SupportedLocale, string>;
  price: Record<SupportedLocale, string>;
  period: Record<SupportedLocale, string>;
  description: Record<SupportedLocale, string>;
  cta: Record<SupportedLocale, string>;
  features: Record<SupportedLocale, string[]>;
};

export type PricingPageContent = {
  eyebrow: Record<SupportedLocale, string>;
  title: Record<SupportedLocale, string>;
  lead: Record<SupportedLocale, string>;
  note: Record<SupportedLocale, string>;
  includes: {
    eyebrow: Record<SupportedLocale, string>;
    title: Record<SupportedLocale, string>;
    items: Record<SupportedLocale, string[]>;
  };
  plans: PricingPlan[];
};

export const pricingPageContent: PricingPageContent = {
  eyebrow: {
    "zh-CN": "使用方案",
    "en-US": "Usage plans",
  },
  title: {
    "zh-CN": "按团队规模选择合适的起步方式",
    "en-US": "Choose the right starting point for your team",
  },
  lead: {
    "zh-CN":
      "以下方案展示 Nuxt Modern Starter 在不同场景下的推荐用法。Starter 适合个人验证与原型，Growth 覆盖完整工程闭环，Custom 面向需要深度定制的企业团队。",
    "en-US":
      "These plans show recommended ways to adopt Nuxt Modern Starter. Starter fits personal validation, Growth covers the full engineering loop, and Custom is for teams that need deeper customization.",
  },
  note: {
    "zh-CN": "价格仅为示例结构，实际使用时请替换为你们产品的套餐、权益说明与转化按钮。",
    "en-US":
      "Prices are example structure only. Replace them with your real plans, benefits, and conversion CTAs in production.",
  },
  plans: [
    {
      key: "starter",
      featured: false,
      ctaPath: "/sign-up",
      name: {
        "zh-CN": "Starter",
        "en-US": "Starter",
      },
      badge: {
        "zh-CN": "个人入门",
        "en-US": "Personal",
      },
      price: {
        "zh-CN": "免费",
        "en-US": "Free",
      },
      period: {
        "zh-CN": "开源模板",
        "en-US": "Open-source template",
      },
      description: {
        "zh-CN": "适合个人学习、概念验证，或快速搭建公开营销页原型。",
        "en-US": "Best for learning, proof of concept, or quickly scaffolding a public marketing site.",
      },
      cta: {
        "zh-CN": "立即开始",
        "en-US": "Get started",
      },
      features: {
        "zh-CN": [
          "Nuxt 4 + TypeScript + Pinia 基础工程",
          "首页、价格、帮助、新闻等公开页面",
          "中英文路由与语言切换",
          "Canonical、hreflang 与 OG 元数据",
        ],
        "en-US": [
          "Nuxt 4 + TypeScript + Pinia foundation",
          "Home, pricing, help, news, and other public pages",
          "Chinese and English routes with language switching",
          "Canonical, hreflang, and OG metadata",
        ],
      },
    },
    {
      key: "growth",
      featured: true,
      ctaPath: "/help",
      name: {
        "zh-CN": "Growth",
        "en-US": "Growth",
      },
      badge: {
        "zh-CN": "团队推荐",
        "en-US": "Recommended",
      },
      price: {
        "zh-CN": "推荐",
        "en-US": "Recommended",
      },
      period: {
        "zh-CN": "完整能力",
        "en-US": "Full starter stack",
      },
      description: {
        "zh-CN": "适合需要账号体系、请求封装、部署验证与质量门禁的小团队产品前台。",
        "en-US":
          "Best for small teams that need auth, request helpers, deployment validation, and quality gates.",
      },
      cta: {
        "zh-CN": "查看能力清单",
        "en-US": "View capability list",
      },
      features: {
        "zh-CN": [
          "场景化 API client 与 Bearer Token 鉴权",
          "登录、注册、账户页与路由守卫示例",
          "Docker 镜像与 Nginx 反向代理样例",
          "Lint、Stylelint、Typecheck 与 Vitest 测试",
        ],
        "en-US": [
          "Scenario-specific API clients and Bearer Token auth",
          "Login, register, account, and route guard examples",
          "Docker image and Nginx reverse-proxy samples",
          "Lint, Stylelint, Typecheck, and Vitest coverage",
        ],
      },
    },
    {
      key: "custom",
      featured: false,
      ctaPath: "/sign-up",
      name: {
        "zh-CN": "Custom",
        "en-US": "Custom",
      },
      badge: {
        "zh-CN": "企业定制",
        "en-US": "Enterprise",
      },
      price: {
        "zh-CN": "联系我们",
        "en-US": "Talk to us",
      },
      period: {
        "zh-CN": "按需扩展",
        "en-US": "Tailored extension",
      },
      description: {
        "zh-CN": "适合需要品牌主题、CMS 接入、复杂权限或多区域部署的企业项目。",
        "en-US":
          "Best for enterprise projects that need brand theming, CMS integration, or multi-region deployment.",
      },
      cta: {
        "zh-CN": "沟通需求",
        "en-US": "Discuss requirements",
      },
      features: {
        "zh-CN": [
          "设计 token 与 Ant Design Vue 主题深度定制",
          "FAQ、新闻等内容迁移至 CMS 或 API",
          "架构文档、使用指南与部署手册",
          "按需补充 E2E、CI 与运维集成方案",
        ],
        "en-US": [
          "Design tokens and Ant Design Vue theme customization",
          "Move FAQ and news content to a CMS or API",
          "Architecture, usage, and deployment documentation",
          "Optional E2E, CI, and ops integration support",
        ],
      },
    },
  ],
  includes: {
    eyebrow: {
      "zh-CN": "所有方案共同包含",
      "en-US": "Included in every plan",
    },
    title: {
      "zh-CN": "一套可复用的公开站点基础能力",
      "en-US": "A reusable public-site foundation",
    },
    items: {
      "zh-CN": [
        "Nuxt 4、Vue 3、SCSS 设计 token 与 Ant Design Vue 组件体系",
        "默认语言无前缀、英文 /en 前缀，以及统一 localePath 工具",
        "Typed 本地 FAQ 与新闻数据，便于后续替换数据源",
        "内置 Yaniv Editor 示例页，便于扩展富文本或文档场景",
      ],
      "en-US": [
        "Nuxt 4, Vue 3, SCSS design tokens, and Ant Design Vue components",
        "Default locale without prefix, English under /en, and shared localePath helpers",
        "Typed local FAQ and news data that can later be replaced by a CMS",
        "Built-in Yaniv Editor sample page for rich text or docs scenarios",
      ],
    },
  },
};
