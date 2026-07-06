/**
 * 文件职责：公开内容 HTTP 控制器。
 */
import { createHttpError } from "../../middlewares/error.middleware.js";
import { getValidated } from "../../utils/getValidated.js";
import { success } from "../../utils/response.js";
import { findNewsArticle, getPricingPage, listNewsArticles, resolveLocale } from "./content.service.js";

import type {
  ValidatedGetPricingSchema,
  ValidatedListNewsSchema,
  ValidatedNewsSlugSchema,
} from "./content.schema.js";
import type { Request, Response } from "express";

function readAcceptLanguage(req: Request) {
  const header = req.headers["accept-language"];
  return typeof header === "string" ? header : undefined;
}

export async function listNews(req: Request, res: Response) {
  const { query } = getValidated<ValidatedListNewsSchema>(req);
  const locale = resolveLocale(readAcceptLanguage(req), query.locale);
  const articles = listNewsArticles(locale);

  return success(res, "获取新闻列表成功", { articles });
}

export async function getNews(req: Request, res: Response) {
  const { params, query } = getValidated<ValidatedNewsSlugSchema>(req);
  const locale = resolveLocale(readAcceptLanguage(req), query.locale);
  const article = findNewsArticle(params.slug, locale);

  if (!article) {
    throw createHttpError(404, "新闻不存在");
  }

  return success(res, "获取新闻详情成功", { article });
}

export async function getPricing(req: Request, res: Response) {
  const { query } = getValidated<ValidatedGetPricingSchema>(req);
  const locale = resolveLocale(readAcceptLanguage(req), query.locale);
  const pricing = getPricingPage(locale);

  return success(res, "获取定价页内容成功", { pricing });
}
