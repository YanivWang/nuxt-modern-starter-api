import { conflict, notFound } from "../../shared/errors/app-error.js";
import { getValidated } from "../../utils/getValidated.js";
import { success } from "../../utils/response.js";

import type { ContentService } from "./content.service.js";
import type {
  ValidatedCreateNewsSchema,
  ValidatedGetPricingSchema,
  ValidatedListNewsSchema,
  ValidatedNewsSlugSchema,
  ValidatedPatchNewsSchema,
} from "./content.schema.js";
import type { Request, Response } from "express";

const acceptLanguage = (req: Request) =>
  typeof req.headers["accept-language"] === "string" ? req.headers["accept-language"] : undefined;

export function createContentController(service: ContentService) {
  return {
    listNews: async (req: Request, res: Response) => {
      const { query } = getValidated<ValidatedListNewsSchema>(req);
      const locale = service.resolveLocale(acceptLanguage(req), query.locale);
      return success(res, "获取新闻列表成功", { articles: service.listNews(locale) });
    },
    getNews: async (req: Request, res: Response) => {
      const { params, query } = getValidated<ValidatedNewsSlugSchema>(req);
      const article = service.findNews(params.slug, service.resolveLocale(acceptLanguage(req), query.locale));
      if (!article) throw notFound("新闻不存在");
      return success(res, "获取新闻详情成功", { article });
    },
    getPricing: async (req: Request, res: Response) => {
      const { query } = getValidated<ValidatedGetPricingSchema>(req);
      return success(res, "获取定价页内容成功", {
        pricing: service.pricing(service.resolveLocale(acceptLanguage(req), query.locale)),
      });
    },
    createNews: async (req: Request, res: Response) => {
      const article = service.createNews(getValidated<ValidatedCreateNewsSchema>(req).body);
      if (!article) throw conflict("新闻 slug 已存在");
      return success(res, "创建新闻成功", { article }, 201);
    },
    patchNews: async (req: Request, res: Response) => {
      const { params, body } = getValidated<ValidatedPatchNewsSchema>(req);
      const article = service.updateNews(params.slug, body);
      if (!article) throw notFound("新闻不存在");
      return success(res, "更新新闻成功", { article });
    },
    deleteNews: async (req: Request, res: Response) => {
      const { params } = getValidated<ValidatedNewsSlugSchema>(req);
      if (!service.deleteNews(params.slug)) throw notFound("新闻不存在");
      return success(res, "删除新闻成功");
    },
  };
}

export type ContentController = ReturnType<typeof createContentController>;
