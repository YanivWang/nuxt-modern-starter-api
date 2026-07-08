/**
 * 文件职责：注册公开内容 HTTP 路由（无需登录）。
 */
import express from "express";

import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
  createNews,
  deleteNews,
  getNews,
  getPricing,
  listNews,
  patchNews,
} from "./content.controller.js";
import {
  createNewsSchema,
  getPricingSchema,
  listNewsSchema,
  newsSlugSchema,
  patchNewsSchema,
} from "./content.schema.js";

const router = express.Router();

router.get("/content/news", validate(listNewsSchema), asyncHandler(listNews, "获取新闻列表失败"));
router.post(
  "/content/news",
  authMiddleware,
  validate(createNewsSchema),
  asyncHandler(createNews, "创建新闻失败"),
);
router.get("/content/pricing", validate(getPricingSchema), asyncHandler(getPricing, "获取定价页内容失败"));
router.get(
  "/content/news/:slug",
  validate(newsSlugSchema),
  asyncHandler(getNews, "获取新闻详情失败"),
);
router.patch(
  "/content/news/:slug",
  authMiddleware,
  validate(patchNewsSchema),
  asyncHandler(patchNews, "更新新闻失败"),
);
router.delete(
  "/content/news/:slug",
  authMiddleware,
  validate(newsSlugSchema),
  asyncHandler(deleteNews, "删除新闻失败"),
);

export default router;
