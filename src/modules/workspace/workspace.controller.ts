/**
 * 文件职责：工作台项目接口的 HTTP 适配层。
 * 读取登录用户与校验结果；Service 因归属不符返回 null 时统一映射为 404，不区分「不存在」与「无权限」。
 */
import { notFound, unauthorized } from "../../shared/errors/app-error.js";
import { getValidated } from "../../utils/getValidated.js";
import { success } from "../../utils/response.js";

import type { WorkspaceService } from "./workspace.service.js";
import type {
  ValidatedCreateProjectSchema,
  ValidatedListProjectsSchema,
  ValidatedPatchProjectSchema,
  ValidatedProjectIdParamsSchema,
} from "./workspace.schema.js";
import type { Request, Response } from "express";

function currentUserId(req: Request) {
  const id = req.user?.id;
  if (typeof id !== "number" || !Number.isFinite(id)) throw unauthorized("未登录或登录已过期");
  return id;
}

export function createWorkspaceController(service: WorkspaceService) {
  return {
    list: async (req: Request, res: Response) => {
      const { query } = getValidated<ValidatedListProjectsSchema>(req);
      const result = await service.listForUser(currentUserId(req), { limit: query.limit, offset: query.offset });
      return success(res, "获取项目列表成功", result);
    },
    create: async (req: Request, res: Response) => {
      const result = await service.createForUser(
        currentUserId(req),
        getValidated<ValidatedCreateProjectSchema>(req).body,
      );
      return success(res, "创建项目成功", result, 201);
    },
    get: async (req: Request, res: Response) => {
      const { params } = getValidated<ValidatedProjectIdParamsSchema>(req);
      const project = await service.findForUser(currentUserId(req), params.projectId);
      if (!project) throw notFound("项目不存在");
      return success(res, "获取项目成功", { project });
    },
    patch: async (req: Request, res: Response) => {
      const { body, params } = getValidated<ValidatedPatchProjectSchema>(req);
      const project = await service.updateForUser(currentUserId(req), params.projectId, body);
      if (!project) throw notFound("项目不存在");
      return success(res, "更新项目成功", { project });
    },
    delete: async (req: Request, res: Response) => {
      const { params } = getValidated<ValidatedProjectIdParamsSchema>(req);
      if (!(await service.deleteForUser(currentUserId(req), params.projectId))) throw notFound("项目不存在");
      return success(res, "删除项目成功");
    },
  };
}

export type WorkspaceController = ReturnType<typeof createWorkspaceController>;
