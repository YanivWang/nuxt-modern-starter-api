---
layout: home

hero:
  name: Nuxt Modern Starter API
  text: 现代 Express API 服务脚手架
  tagline: 从入口链路、技术栈、功能模块到部署运维，一套给新人完整理解项目的文档。
  actions:
    - theme: brand
      text: 从快速上手开始
      link: /guide/getting-started
    - theme: alt
      text: 查看整体架构
      link: /guide/architecture

features:
  - title: 清晰的后端分层
    details: server/app 负责启动与装配，middlewares 承载横切能力，modules 按 auth/user/content/workspace/document/upload 分业务边界。
  - title: Web App 登录态
    details: JWT access token、数据库 refresh token 会话、Cookie + CSRF、Redis 黑名单共同组成认证体系。
  - title: 完整工程闭环
    details: Zod 校验、OpenAPI 生成、Vitest、ESLint、Prettier、Docker Compose 和 CI 质量门禁已经配好。
---

## 这份文档解决什么问题

这个仓库是一个独立的 Express API 服务脚手架，适合承载普通 Web App 后端常见能力：注册登录、当前用户、用户资料、公开新闻/定价内容、工作台项目、编辑器文档、图片上传、大文件分片上传、健康检查、Swagger 文档、MySQL 持久化、可选 Redis、Docker 部署和 CI 检查。

如果你是第一次接触这个项目，建议按下面顺序阅读：

1. 先看 [快速上手](/guide/getting-started)，把服务跑起来，知道有哪些命令。
2. 再看 [技术栈总览](/guide/tech-stack)，理解每个依赖为什么存在。
3. 继续看 [整体架构](/guide/architecture) 和 [请求生命周期](/guide/request-lifecycle)，建立代码流向。
4. 按业务阅读 [认证模块](/modules/auth)、[用户模块](/modules/user)、[公开内容模块](/modules/content)、[工作台模块](/modules/workspace)、[文档模块](/modules/document)、[上传模块](/modules/upload)。
5. 最后看 [Docker 部署设计](/deployment/docker) 和 [安全与运维要点](/deployment/security-operations)。

## 项目一句话

`nuxt-modern-starter-api` 是一个 TypeScript ESM 后端模板：它把 Express 的路由、中间件、认证、公开内容、工作台项目、编辑器文档、数据库迁移、接口文档、上传、测试、容器化部署整理成一套可裁剪的基础工程。

## 文档和源码的关系

这份 VitePress 文档基于当前源码组织方式编写。源码中的文件头注释用于解释单个文件的职责；本文档负责解释跨文件的架构设计、模块协作和部署边界。

接口文档有两套用途：

- 本文档讲“系统怎么设计、怎么维护”。
- `src/openapi.ts` 和 `docs/openapi.yaml` 讲“HTTP 接口有哪些、参数是什么”。
