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

export function createContentRoutes(controller: ContentController, auth: AuthMiddleware) {
  const router = express.Router();
  router.get("/content/news", validate(listNewsSchema), asyncHandler(controller.listNews, "获取新闻列表失败"));
  router.post("/content/news", auth, validate(createNewsSchema), asyncHandler(controller.createNews, "创建新闻失败"));
  router.get("/content/pricing", validate(getPricingSchema), asyncHandler(controller.getPricing, "获取定价页内容失败"));
  router.get("/content/news/:slug", validate(newsSlugSchema), asyncHandler(controller.getNews, "获取新闻详情失败"));
  router.patch(
    "/content/news/:slug",
    auth,
    validate(patchNewsSchema),
    asyncHandler(controller.patchNews, "更新新闻失败"),
  );
  router.delete(
    "/content/news/:slug",
    auth,
    validate(newsSlugSchema),
    asyncHandler(controller.deleteNews, "删除新闻失败"),
  );
  return router;
}
