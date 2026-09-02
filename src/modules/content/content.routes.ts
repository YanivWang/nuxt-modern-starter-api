/**
 * 文件职责：注册公开内容路由。
 * 新闻/定价读接口匿名可访问；新闻的创建、更新、删除要求管理员。
 *
 * 写接口挂的是 auth + requireAdmin 两层。只挂 auth 是不够的：
 * 它只回答「是不是登录用户」，于是任何人注册一个账号就能删掉全站新闻——
 * 这些接口改的是所有匿名访客都会看到的公开内容，不是调用者自己的资源。
 */
import express from "express";

import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
  createNewsSchema,
  getPricingSchema,
  listNewsSchema,
  newsSlugSchema,
  patchNewsSchema,
} from "./content.schema.js";

import type { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import type { ContentController } from "./content.controller.js";
import type { RequestHandler } from "express";

export function createContentRoutes(controller: ContentController, auth: AuthMiddleware, requireAdmin: RequestHandler) {
  const router = express.Router();
  router.get("/content/news", validate(listNewsSchema), asyncHandler(controller.listNews, "获取新闻列表失败"));
  router.post(
    "/content/news",
    auth,
    requireAdmin,
    validate(createNewsSchema),
    asyncHandler(controller.createNews, "创建新闻失败"),
  );
  router.get("/content/pricing", validate(getPricingSchema), asyncHandler(controller.getPricing, "获取定价页内容失败"));
  router.get("/content/news/:slug", validate(newsSlugSchema), asyncHandler(controller.getNews, "获取新闻详情失败"));
  router.patch(
    "/content/news/:slug",
    auth,
    requireAdmin,
    validate(patchNewsSchema),
    asyncHandler(controller.patchNews, "更新新闻失败"),
  );
  router.delete(
    "/content/news/:slug",
    auth,
    requireAdmin,
    validate(newsSlugSchema),
    asyncHandler(controller.deleteNews, "删除新闻失败"),
  );
  return router;
}
