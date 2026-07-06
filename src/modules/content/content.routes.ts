/**
 * 文件职责：注册公开内容 HTTP 路由（无需登录）。
 */
import express from "express";

import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { getNews, getPricing, listNews } from "./content.controller.js";
import { getPricingSchema, listNewsSchema, newsSlugSchema } from "./content.schema.js";

const router = express.Router();

router.get("/content/news", validate(listNewsSchema), asyncHandler(listNews, "获取新闻列表失败"));
router.get("/content/pricing", validate(getPricingSchema), asyncHandler(getPricing, "获取定价页内容失败"));
router.get(
  "/content/news/:slug",
  validate(newsSlugSchema),
  asyncHandler(getNews, "获取新闻详情失败"),
);

export default router;
