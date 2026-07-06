/**
 * 文件职责：工作台项目 HTTP 控制器。
 */
import { createHttpError } from "../../middlewares/error.middleware.js";
import { getValidated } from "../../utils/getValidated.js";
import { success } from "../../utils/response.js";
import {
  createProjectForUser,
  deleteProjectForUser,
  findProjectForUser,
  listProjectsForUser,
  updateProjectForUser,
} from "./workspace.service.js";

import type {
  ValidatedCreateProjectSchema,
  ValidatedPatchProjectSchema,
  ValidatedProjectIdParamsSchema,
} from "./workspace.schema.js";
import type { Request, Response } from "express";

function currentUserId(req: Request) {
  const uid = req.user?.id;
  if (typeof uid !== "number" || !Number.isFinite(uid)) {
    throw createHttpError(401, "未登录或登录已过期");
  }
  return uid;
}

export async function listProjects(req: Request, res: Response) {
  const projects = await listProjectsForUser(currentUserId(req));
  return success(res, "获取项目列表成功", { projects });
}

export async function createProject(req: Request, res: Response) {
  const { body } = getValidated<ValidatedCreateProjectSchema>(req);
  const result = await createProjectForUser(currentUserId(req), body);
  return success(res, "创建项目成功", result, 201);
}

export async function getProject(req: Request, res: Response) {
  const { params } = getValidated<ValidatedProjectIdParamsSchema>(req);
  const project = await findProjectForUser(currentUserId(req), params.projectId);

  if (!project) {
    throw createHttpError(404, "项目不存在");
  }

  return success(res, "获取项目成功", { project });
}

export async function patchProject(req: Request, res: Response) {
  const { body, params } = getValidated<ValidatedPatchProjectSchema>(req);
  const project = await updateProjectForUser(currentUserId(req), params.projectId, body);

  if (!project) {
    throw createHttpError(404, "项目不存在");
  }

  return success(res, "更新项目成功", { project });
}

export async function deleteProject(req: Request, res: Response) {
  const { params } = getValidated<ValidatedProjectIdParamsSchema>(req);
  const deleted = await deleteProjectForUser(currentUserId(req), params.projectId);

  if (!deleted) {
    throw createHttpError(404, "项目不存在");
  }

  return success(res, "删除项目成功", null);
}
