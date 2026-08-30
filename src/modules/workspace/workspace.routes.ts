/**
 * 文件职责：注册项目路由 /projects 与 /projects/:projectId，全部要求登录。
 * 列表接口通过 listProjectsSchema 校验并归一化分页参数。
 */
import express from "express";

import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
  createProjectSchema,
  listProjectsSchema,
  patchProjectSchema,
  projectIdParamsSchema,
} from "./workspace.schema.js";

import type { AuthMiddleware } from "../../middlewares/auth.middleware.js";
import type { WorkspaceController } from "./workspace.controller.js";

export function createWorkspaceRoutes(controller: WorkspaceController, auth: AuthMiddleware) {
  const router = express.Router();
  router.get("/projects", auth, validate(listProjectsSchema), asyncHandler(controller.list, "获取项目列表失败"));
  router.post("/projects", auth, validate(createProjectSchema), asyncHandler(controller.create, "创建项目失败"));
  router.get(
    "/projects/:projectId",
    auth,
    validate(projectIdParamsSchema),
    asyncHandler(controller.get, "获取项目失败"),
  );
  router.patch(
    "/projects/:projectId",
    auth,
    validate(patchProjectSchema),
    asyncHandler(controller.patch, "更新项目失败"),
  );
  router.delete(
    "/projects/:projectId",
    auth,
    validate(projectIdParamsSchema),
    asyncHandler(controller.delete, "删除项目失败"),
  );
  return router;
}
