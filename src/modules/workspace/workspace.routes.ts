/**
 * 文件职责：注册工作台项目 HTTP 路由。
 */
import express from "express";

import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { createProject, deleteProject, getProject, listProjects } from "./workspace.controller.js";
import { createProjectSchema, projectIdParamsSchema } from "./workspace.schema.js";

const router = express.Router();

router.get("/projects", authMiddleware, asyncHandler(listProjects, "获取项目列表失败"));
router.post("/projects", authMiddleware, validate(createProjectSchema), asyncHandler(createProject, "创建项目失败"));
router.get(
  "/projects/:projectId",
  authMiddleware,
  validate(projectIdParamsSchema),
  asyncHandler(getProject, "获取项目失败"),
);
router.delete(
  "/projects/:projectId",
  authMiddleware,
  validate(projectIdParamsSchema),
  asyncHandler(deleteProject, "删除项目失败"),
);

export default router;
