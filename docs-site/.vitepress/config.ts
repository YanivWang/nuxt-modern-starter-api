import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Express Modern Starter",
  description: "Express Modern Starter 项目架构、技术栈、模块与部署文档",
  lang: "zh-CN",
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    logo: "/logo.svg",
    search: {
      provider: "local",
    },
    nav: [
      { text: "入门", link: "/guide/getting-started" },
      { text: "架构", link: "/guide/architecture" },
      { text: "模块", link: "/modules/auth" },
      { text: "部署", link: "/deployment/docker" },
      { text: "OpenAPI", link: "/infrastructure/openapi" },
    ],
    sidebar: [
      {
        text: "新人入门",
        items: [
          { text: "文档首页", link: "/" },
          { text: "快速上手", link: "/guide/getting-started" },
          { text: "技术栈总览", link: "/guide/tech-stack" },
          { text: "目录职责索引", link: "/reference/directory" },
        ],
      },
      {
        text: "架构设计",
        items: [
          { text: "整体架构", link: "/guide/architecture" },
          { text: "请求生命周期", link: "/guide/request-lifecycle" },
          { text: "配置、数据库与 Redis", link: "/infrastructure/env-db-redis" },
          { text: "OpenAPI 与 Swagger", link: "/infrastructure/openapi" },
        ],
      },
      {
        text: "功能模块",
        items: [
          { text: "认证模块", link: "/modules/auth" },
          { text: "用户模块", link: "/modules/user" },
          { text: "上传模块", link: "/modules/upload" },
        ],
      },
      {
        text: "工程与部署",
        items: [
          { text: "开发、测试与质量门禁", link: "/development/testing-quality" },
          { text: "Docker 部署设计", link: "/deployment/docker" },
          { text: "安全与运维要点", link: "/deployment/security-operations" },
        ],
      },
    ],
    footer: {
      message: "Express Modern Starter 文档站",
      copyright: "基于当前仓库源码维护",
    },
  },
});
