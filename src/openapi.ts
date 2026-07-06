/**
 * 文件职责：从运行时 Zod 校验规则生成 OpenAPI 3.1 文档。
 * Swagger 页面和 docs/openapi.yaml 都使用这里的同一份定义，避免接口校验与文档分叉。
 */
import yaml from "js-yaml";
import { z } from "zod";

import {
  MAX_LARGE_UPLOAD_CHUNKS,
  largeUploadIdParamsSchema,
  largeUploadInitSchema,
} from "./modules/upload/large-upload.schema.js";
import { getPricingSchema, listNewsSchema, newsSlugSchema } from "./modules/content/content.schema.js";
import { createProjectSchema, patchProjectSchema, projectIdParamsSchema } from "./modules/workspace/workspace.schema.js";
import { documentIdParamsSchema, patchDocumentSchema } from "./modules/document/document.schema.js";
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from "./modules/auth/auth.schema.js";
import { patchMyProfileSchema } from "./modules/user/user-profile.schema.js";

type OpenApiSchema = Record<string, unknown> & {
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
};

type OpenApiMedia = {
  schema: OpenApiSchema;
};

type OpenApiOperation = {
  tags: string[];
  summary?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: Array<Record<string, unknown>>;
  requestBody?: {
    required?: boolean;
    content: Record<string, OpenApiMedia>;
  };
  responses: Record<string, { description: string; content?: Record<string, OpenApiMedia> }>;
};

export type OpenApiSpec = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description: string }>;
  components: {
    securitySchemes: Record<string, Record<string, unknown>>;
    schemas: Record<string, OpenApiSchema>;
  };
  paths: Record<string, Record<string, OpenApiOperation>>;
};

function stripJsonSchemaMeta(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripJsonSchemaMeta);
  if (!value || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key === "$schema") continue;
    out[key] = stripJsonSchemaMeta(nested);
  }
  return out;
}

function zodInputSchema(schema: z.ZodType): OpenApiSchema {
  // OpenAPI 请求 schema 直接复用路由 Zod 规则，避免文档和运行时校验各写一套。
  return stripJsonSchemaMeta(z.toJSONSchema(schema, { io: "input" })) as OpenApiSchema;
}

function jsonRequestBody(schema: z.ZodType): OpenApiOperation["requestBody"] {
  return {
    required: true,
    content: {
      "application/json": {
        schema: zodInputSchema(schema),
      },
    },
  };
}

function multipartRequestBody(fieldName: string, multiple: boolean): OpenApiOperation["requestBody"] {
  const fileSchema: OpenApiSchema = { type: "string", format: "binary" };
  return {
    required: true,
    content: {
      "multipart/form-data": {
        schema: {
          type: "object",
          properties: {
            [fieldName]: multiple ? { type: "array", items: fileSchema } : fileSchema,
          },
          required: [fieldName],
        },
      },
    },
  };
}

function bearerAuth() {
  return [{ bearerAuth: [] }];
}

function jsonResponse(description: string, schema: OpenApiSchema) {
  return {
    description,
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

function schemaRef(name: string): OpenApiSchema {
  return { $ref: `#/components/schemas/${name}` };
}

function ok(description: string) {
  // 当前 API 响应统一是 { code, message, data }；具体业务字段放在 data 内。
  return {
    "200": jsonResponse(description, schemaRef("SuccessBody")),
    "400": jsonResponse("请求参数错误", schemaRef("ErrorBody")),
    "500": jsonResponse("服务器内部错误", schemaRef("ErrorBody")),
  };
}

function uploadIdParam() {
  // 路径参数也从 Zod schema 转换，保持 controller 校验与 OpenAPI 描述一致。
  const schema = zodInputSchema(largeUploadIdParamsSchema.shape.params.shape.uploadId);
  return {
    name: "uploadId",
    in: "path",
    required: true,
    schema,
  };
}

function chunkIndexParam() {
  return {
    name: "chunkIndex",
    in: "path",
    required: true,
    schema: {
      type: "integer",
      minimum: 0,
      maximum: MAX_LARGE_UPLOAD_CHUNKS - 1,
    },
  };
}

export function generateOpenApiSpec(): OpenApiSpec {
  return {
    openapi: "3.1.0",
    info: {
      title: "Nuxt Modern Starter API",
      version: "1.0.0",
      description: "独立 Express API 服务脚手架，保留 auth、user、health、upload 和 large-upload 通用能力。",
    },
    servers: [
      { url: "http://127.0.0.1:3000", description: "本地 API 服务" },
      { url: "http://127.0.0.1:2026", description: "Docker Nginx 网关" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        SuccessBody: {
          type: "object",
          properties: {
            code: { type: "integer" },
            message: { type: "string" },
            data: {},
          },
          required: ["code", "message", "data"],
          additionalProperties: false,
        },
        ErrorBody: {
          type: "object",
          properties: {
            code: { type: "integer" },
            message: { type: "string" },
            data: { type: "null" },
          },
          required: ["code", "message", "data"],
          additionalProperties: false,
        },
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["探针"],
          summary: "存活探针",
          responses: ok("ok"),
        },
      },
      "/ready": {
        get: {
          tags: ["探针"],
          summary: "就绪探针",
          responses: ok("ok"),
        },
      },
      "/api/register": {
        post: {
          tags: ["认证"],
          summary: "注册用户",
          requestBody: jsonRequestBody(registerSchema.shape.body),
          responses: ok("注册成功"),
        },
      },
      "/api/login": {
        post: {
          tags: ["认证"],
          summary: "用户登录",
          requestBody: jsonRequestBody(loginSchema.shape.body),
          responses: ok("登录成功，返回 accessToken、refreshToken，并写入 httpOnly cookie"),
        },
      },
      "/api/refresh": {
        post: {
          tags: ["认证"],
          summary: "刷新 access token 并轮换 refresh token",
          requestBody: jsonRequestBody(refreshSchema.shape.body),
          responses: ok("刷新成功，返回新的 accessToken、refreshToken，并写入 httpOnly cookie"),
        },
      },
      "/api/logout": {
        post: {
          tags: ["认证"],
          summary: "退出登录",
          security: bearerAuth(),
          requestBody: jsonRequestBody(logoutSchema.shape.body),
          responses: ok("退出登录成功"),
        },
      },
      "/api/me": {
        get: {
          tags: ["当前用户"],
          summary: "获取当前用户",
          security: bearerAuth(),
          responses: ok("当前用户基础资料"),
        },
      },
      "/api/me/profile": {
        get: {
          tags: ["当前用户"],
          summary: "获取当前用户扩展资料",
          security: bearerAuth(),
          responses: ok("当前用户扩展资料"),
        },
        patch: {
          tags: ["当前用户"],
          summary: "更新当前用户扩展资料",
          security: bearerAuth(),
          requestBody: jsonRequestBody(patchMyProfileSchema.shape.body),
          responses: ok("更新当前用户扩展资料"),
        },
      },
      "/api/content/news": {
        get: {
          tags: ["公开内容"],
          summary: "获取新闻列表",
          parameters: [
            {
              name: "locale",
              in: "query",
              required: false,
              schema: zodInputSchema(listNewsSchema.shape.query.shape.locale),
            },
          ],
          responses: ok("本地化新闻列表"),
        },
      },
      "/api/content/pricing": {
        get: {
          tags: ["公开内容"],
          summary: "获取定价页内容",
          parameters: [
            {
              name: "locale",
              in: "query",
              required: false,
              schema: zodInputSchema(getPricingSchema.shape.query.shape.locale),
            },
          ],
          responses: ok("本地化定价页内容"),
        },
      },
      "/api/content/news/{slug}": {
        get: {
          tags: ["公开内容"],
          summary: "获取新闻详情",
          parameters: [
            {
              name: "slug",
              in: "path",
              required: true,
              schema: zodInputSchema(newsSlugSchema.shape.params.shape.slug),
            },
            {
              name: "locale",
              in: "query",
              required: false,
              schema: zodInputSchema(newsSlugSchema.shape.query.shape.locale),
            },
          ],
          responses: ok("本地化新闻详情"),
        },
      },
      "/api/projects": {
        get: {
          tags: ["项目"],
          summary: "获取当前用户项目列表",
          security: bearerAuth(),
          responses: ok("当前用户项目列表"),
        },
        post: {
          tags: ["项目"],
          summary: "创建项目并初始化文档",
          security: bearerAuth(),
          requestBody: jsonRequestBody(createProjectSchema.shape.body),
          responses: ok("创建项目成功"),
        },
      },
      "/api/projects/{projectId}": {
        get: {
          tags: ["项目"],
          summary: "获取当前用户项目详情",
          security: bearerAuth(),
          parameters: [
            {
              name: "projectId",
              in: "path",
              required: true,
              schema: zodInputSchema(projectIdParamsSchema.shape.params.shape.projectId),
            },
          ],
          responses: ok("项目详情"),
        },
        patch: {
          tags: ["项目"],
          summary: "更新当前用户项目",
          security: bearerAuth(),
          parameters: [
            {
              name: "projectId",
              in: "path",
              required: true,
              schema: zodInputSchema(projectIdParamsSchema.shape.params.shape.projectId),
            },
          ],
          requestBody: jsonRequestBody(patchProjectSchema.shape.body),
          responses: ok("更新项目成功"),
        },
        delete: {
          tags: ["项目"],
          summary: "删除当前用户项目",
          security: bearerAuth(),
          parameters: [
            {
              name: "projectId",
              in: "path",
              required: true,
              schema: zodInputSchema(projectIdParamsSchema.shape.params.shape.projectId),
            },
          ],
          responses: ok("删除项目成功"),
        },
      },
      "/api/documents/{documentId}": {
        get: {
          tags: ["文档"],
          summary: "获取当前用户文档",
          security: bearerAuth(),
          parameters: [
            {
              name: "documentId",
              in: "path",
              required: true,
              schema: zodInputSchema(documentIdParamsSchema.shape.params.shape.documentId),
            },
          ],
          responses: ok("文档详情"),
        },
        patch: {
          tags: ["文档"],
          summary: "保存当前用户文档",
          security: bearerAuth(),
          parameters: [
            {
              name: "documentId",
              in: "path",
              required: true,
              schema: zodInputSchema(documentIdParamsSchema.shape.params.shape.documentId),
            },
          ],
          requestBody: jsonRequestBody(patchDocumentSchema.shape.body),
          responses: ok("保存文档成功"),
        },
      },
      "/api/uploads": {
        post: {
          tags: ["上传"],
          summary: "上传通用图片",
          security: bearerAuth(),
          requestBody: multipartRequestBody("files", true),
          responses: ok("上传通用图片，返回 /uploads/common/... URL"),
        },
      },
      "/api/uploads/profiles": {
        post: {
          tags: ["上传"],
          summary: "上传用户头像/资料图",
          security: bearerAuth(),
          requestBody: multipartRequestBody("files", true),
          responses: ok("上传用户头像/资料图"),
        },
      },
      "/api/uploads/large/init": {
        post: {
          tags: ["上传"],
          summary: "创建大文件分片上传任务",
          security: bearerAuth(),
          requestBody: jsonRequestBody(largeUploadInitSchema.shape.body),
          responses: ok("创建大文件分片上传任务或秒传"),
        },
      },
      "/api/uploads/large/{uploadId}/status": {
        get: {
          tags: ["上传"],
          summary: "查询大文件上传状态",
          security: bearerAuth(),
          parameters: [uploadIdParam()],
          responses: ok("查询上传状态"),
        },
      },
      "/api/uploads/large/{uploadId}/chunks/{chunkIndex}": {
        put: {
          tags: ["上传"],
          summary: "上传大文件分片",
          security: bearerAuth(),
          parameters: [
            uploadIdParam(),
            chunkIndexParam(),
            {
              name: "X-Chunk-Md5",
              in: "header",
              required: true,
              schema: { type: "string", minLength: 32, maxLength: 32, pattern: "^[a-fA-F0-9]{32}$" },
            },
          ],
          requestBody: multipartRequestBody("chunk", false),
          responses: ok("分片已接收"),
        },
      },
      "/api/uploads/large/{uploadId}/merge": {
        post: {
          tags: ["上传"],
          summary: "合并大文件分片",
          security: bearerAuth(),
          parameters: [uploadIdParam()],
          responses: ok("合并完成"),
        },
      },
      "/api/uploads/large/{uploadId}": {
        delete: {
          tags: ["上传"],
          summary: "取消大文件上传任务",
          security: bearerAuth(),
          parameters: [uploadIdParam()],
          responses: ok("已取消"),
        },
      },
    },
  };
}

export function openApiYaml(): string {
  return `${yaml.dump(generateOpenApiSpec(), { lineWidth: 120, noRefs: true, sortKeys: false })}`;
}
