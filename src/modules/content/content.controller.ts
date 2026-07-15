/**
 * 文件职责：公开内容 HTTP 控制器。
 * 公开读接口无需登录；新闻写接口由路由层挂 authMiddleware，并在写入后异步触发 Nuxt revalidate。
 */
import { createHttpError } from "../../middlewares/error.middleware.js";
import { getValidated } from "../../utils/getValidated.js";
import { revalidateNewsPaths } from "../../utils/revalidate.js";
import { success } from "../../utils/response.js";
import {
  createNewsArticle,
  deleteNewsArticle,
  findNewsArticle,
  getPricingPage,
  listNewsArticles,
  resolveLocale,
  updateNewsArticle,
} from "./content.service.js";

import type {
  ValidatedCreateNewsSchema,
  ValidatedGetPricingSchema,
  ValidatedListNewsSchema,
  ValidatedNewsSlugSchema,
  ValidatedPatchNewsSchema,
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

export async function createNews(req: Request, res: Response) {
  const { body } = getValidated<ValidatedCreateNewsSchema>(req);
  const article = createNewsArticle(body);

  if (!article) {
    throw createHttpError(409, "新闻 slug 已存在");
  }

  // 内容仍存于进程内数组；revalidate 只是通知前端清缓存，不代表数据已持久化。
  revalidateNewsPaths(article.slug);

  return success(res, "创建新闻成功", { article }, 201);
}

export async function patchNews(req: Request, res: Response) {
  const { params, body } = getValidated<ValidatedPatchNewsSchema>(req);
  const article = updateNewsArticle(params.slug, body);

  if (!article) {
    throw createHttpError(404, "新闻不存在");
  }

  // 不等待前端缓存刷新，避免内容 API 因 Nuxt revalidate 短暂失败而整体失败。
  revalidateNewsPaths(article.slug);

  return success(res, "更新新闻成功", { article });
}

export async function deleteNews(req: Request, res: Response) {
  const { params } = getValidated<ValidatedNewsSlugSchema>(req);
  const deleted = deleteNewsArticle(params.slug);

  if (!deleted) {
    throw createHttpError(404, "新闻不存在");
  }

  revalidateNewsPaths(params.slug);

  return success(res, "删除新闻成功", null);
}
