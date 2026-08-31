/**
 * 文件职责：从运行时 Zod 校验规则与响应契约生成 OpenAPI 3.1 文档。
 * Swagger 页面和 docs/openapi.yaml 都使用这里的同一份定义，避免接口校验与文档分叉。
 *
 * 请求 schema 复用路由的 Zod 规则；响应 schema 复用各模块 *.contract.ts 里的
 * 响应契约——那同一份 schema 又通过 z.infer 推导出 DTO 类型，
 * 所以「文档写的响应」和「mapper 真正返回的响应」在结构上不可能各说各话。
 */
import yaml from "js-yaml";
import { z } from "zod";

import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  paginationQuerySchema,
  paginationSchema,
} from "./shared/http/pagination.js";
import { errorEnvelopeSchema, nullDataEnvelopeSchema } from "./shared/http/api-envelope.js";
import {
  MAX_LARGE_UPLOAD_CHUNKS,
  largeUploadIdParamsSchema,
  largeUploadInitSchema,
} from "./modules/upload/large-upload.schema.js";
import {
  chunkAcceptedEnvelopeSchema,
  chunkAcceptedSchema,
  emptyDataEnvelopeSchema,
  emptyDataSchema,
  imageUploadEnvelopeSchema,
  imageUploadResultSchema,
  largeUploadInitEnvelopeSchema,
  largeUploadInitResultSchema,
  largeUploadMergeEnvelopeSchema,
  largeUploadMergeResultSchema,
  largeUploadStatusEnvelopeSchema,
  largeUploadStatusSchema,
} from "./modules/upload/upload.contract.js";
import {
  createNewsSchema,
  getPricingSchema,
  listNewsSchema,
  newsSlugSchema,
  patchNewsSchema,
} from "./modules/content/content.schema.js";
import {
  localizedNewsArticleSchema,
  localizedNewsSummarySchema,
  localizedPricingPageSchema,
  localizedPricingPlanSchema,
  newsArticleEnvelopeSchema,
  newsArticleSchema,
  newsListEnvelopeSchema,
  newsSourceEnvelopeSchema,
  pricingEnvelopeSchema,
} from "./modules/content/content.contract.js";
import {
  createProjectSchema,
  patchProjectSchema,
  projectIdParamsSchema,
} from "./modules/workspace/workspace.schema.js";
import {
  projectCreatedEnvelopeSchema,
  projectDtoSchema,
  projectEnvelopeSchema,
  projectListEnvelopeSchema,
} from "./modules/workspace/workspace.contract.js";
import { documentIdParamsSchema, patchDocumentSchema } from "./modules/document/document.schema.js";
import { documentDtoSchema, documentEnvelopeSchema } from "./modules/document/document.contract.js";
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from "./modules/auth/auth.schema.js";
import { authTokenPairEnvelopeSchema, authTokenPairSchema } from "./modules/auth/auth.contract.js";
import { patchMyProfileSchema } from "./modules/user/user-profile.schema.js";
import {
  meEnvelopeSchema,
  profileEnvelopeSchema,
  publicUserSchema,
  updatedProfileEnvelopeSchema,
  userProfileSchema,
} from "./modules/user/user.contract.js";

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

/**
 * 响应契约 → OpenAPI components 的映射。
 *
 * 键就是 components.schemas 里的名字；注册过的 schema 在被别的 schema 引用时
 * 会生成 $ref，没注册的会就地内联。因此凡是被多个响应共用的实体都要登记在这里，
 * 否则同一个 ProjectDto 会在 yaml 里出现三份互相独立的副本——那正是漂移的温床。
 *
 * 命名约定沿用既有的 *Body 后缀表示完整的 { code, message, data } 信封，
 * 不带后缀的是信封里 data 的组成部分。
 */
const RESPONSE_COMPONENTS = {
  Pagination: paginationSchema,
  ProjectDto: projectDtoSchema,
  DocumentDto: documentDtoSchema,
  AuthTokenPair: authTokenPairSchema,
  PublicUser: publicUserSchema,
  UserProfile: userProfileSchema,
  NewsArticleSource: newsArticleSchema,
  LocalizedNewsSummary: localizedNewsSummarySchema,
  LocalizedNewsArticle: localizedNewsArticleSchema,
  LocalizedPricingPlan: localizedPricingPlanSchema,
  LocalizedPricingPage: localizedPricingPageSchema,
  ImageUploadResult: imageUploadResultSchema,
  LargeUploadInitResult: largeUploadInitResultSchema,
  LargeUploadStatus: largeUploadStatusSchema,
  LargeUploadMergeResult: largeUploadMergeResultSchema,
  ChunkAccepted: chunkAcceptedSchema,
  EmptyData: emptyDataSchema,

  ErrorBody: errorEnvelopeSchema,
  NullDataBody: nullDataEnvelopeSchema,
  AuthTokenPairBody: authTokenPairEnvelopeSchema,
  MeBody: meEnvelopeSchema,
  ProfileBody: profileEnvelopeSchema,
  UpdatedProfileBody: updatedProfileEnvelopeSchema,
  NewsListBody: newsListEnvelopeSchema,
  NewsArticleBody: newsArticleEnvelopeSchema,
  NewsSourceBody: newsSourceEnvelopeSchema,
  PricingBody: pricingEnvelopeSchema,
  ProjectListBody: projectListEnvelopeSchema,
  ProjectBody: projectEnvelopeSchema,
  ProjectCreatedBody: projectCreatedEnvelopeSchema,
  DocumentBody: documentEnvelopeSchema,
  ImageUploadBody: imageUploadEnvelopeSchema,
  LargeUploadInitResultBody: largeUploadInitEnvelopeSchema,
  LargeUploadStatusBody: largeUploadStatusEnvelopeSchema,
  LargeUploadMergeBody: largeUploadMergeEnvelopeSchema,
  ChunkAcceptedBody: chunkAcceptedEnvelopeSchema,
  EmptyDataBody: emptyDataEnvelopeSchema,
} as const satisfies Record<string, z.ZodType>;

/** 信封 component 的名字；ok() 只接受这些，避免把 data 层 schema 直接挂到响应上。 */
type ResponseBodyComponent = Extract<keyof typeof RESPONSE_COMPONENTS, `${string}Body`>;

const responseRegistry = z.registry<{ id: string }>();
for (const [id, schema] of Object.entries(RESPONSE_COMPONENTS)) {
  responseRegistry.add(schema, { id });
}

function stripJsonSchemaMeta(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripJsonSchemaMeta);
  if (!value || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    // $schema / $id 是 JSON Schema 文档自身的元信息，OpenAPI components 里不需要，
    // 留着只会让 swagger-ui 与各类生成器把它当成外部引用去解析。
    if (key === "$schema" || key === "$id") continue;
    out[key] = stripJsonSchemaMeta(nested);
  }
  return out;
}

function zodInputSchema(schema: z.ZodType): OpenApiSchema {
  // OpenAPI 请求 schema 直接复用路由 Zod 规则，避免文档和运行时校验各写一套。
  return stripJsonSchemaMeta(z.toJSONSchema(schema, { io: "input" })) as OpenApiSchema;
}

/** 响应必须用 io: "output"：带默认值或转换的字段在出参侧才是它真正的形状。 */
function responseComponentSchemas(): Record<string, OpenApiSchema> {
  const { schemas } = z.toJSONSchema(responseRegistry, {
    io: "output",
    uri: (id) => `#/components/schemas/${id}`,
  });

  return Object.fromEntries(
    Object.entries(schemas).map(([id, schema]) => [id, stripJsonSchemaMeta(schema) as OpenApiSchema]),
  );
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

/** 端点在通用错误之外还会返回的状态码，与 middlewares/error.middleware.ts 的映射一一对应。 */
type ExtraErrorStatus = "401" | "403" | "404" | "409" | "410";

const ERROR_DESCRIPTIONS: Record<string, string> = {
  "400": "请求参数错误",
  "401": "未登录、登录已过期或凭证无效",
  "403": "CSRF 校验失败，或访问了不属于自己的资源",
  "404": "资源不存在；也用于「存在但不属于当前用户」，不区分两者以免暴露他人资源是否存在",
  "409": "与现有资源状态冲突",
  "410": "上传任务已过期",
  "429": "触发限流或账号锁定",
  "500": "服务器内部错误",
};

/**
 * 成功响应 + 该端点真实会返回的错误响应。
 *
 * 成功状态码必须显式传：创建类接口回的是 201，写成 200 会让消费方按错的状态码分支。
 *
 * errors 也必须逐个端点写准。此前所有端点统一只声明 400/429/500，而集成测试里
 * 401/403/404/409 早就实实在在地出现过 —— 照着契约写客户端的人会以为
 * GET /projects/{projectId} 永远不会 404。少声明一个状态码，和把响应 data 写成空对象
 * 是同一类问题：契约看着完整，其实没描述真实行为。
 *
 * 反向的「多声明一个到不了的状态码」同样有害，所以这里的取值逐个对着抛错点核过，
 * 并由 tests/unit/openapi.test.ts 的机械不变量与集成测试的实测状态码两头夹住。
 */
function ok(
  description: string,
  body: ResponseBodyComponent,
  options: { created?: boolean; errors?: ExtraErrorStatus[] } = {},
) {
  const statuses = ["400", ...(options.errors ?? []), "429", "500"].sort();

  return {
    [options.created ? "201" : "200"]: jsonResponse(description, schemaRef(body)),
    ...Object.fromEntries(
      statuses.map((status) => [status, jsonResponse(ERROR_DESCRIPTIONS[status], schemaRef("ErrorBody"))]),
    ),
  };
}

/** 列表接口共用的分页 query 参数，与 shared/http/pagination.ts 的运行时校验同源。 */
function paginationParams() {
  return [
    {
      name: "limit",
      in: "query",
      required: false,
      description: `单页条数，默认 ${DEFAULT_PAGE_LIMIT}，最大 ${MAX_PAGE_LIMIT}`,
      schema: zodInputSchema(paginationQuerySchema.shape.limit),
    },
    {
      name: "offset",
      in: "query",
      required: false,
      description: "起始偏移量，默认 0",
      schema: zodInputSchema(paginationQuerySchema.shape.offset),
    },
  ];
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
      description:
        "独立 Express API 服务脚手架，覆盖健康探针、认证、当前用户与资料、公开内容（新闻/定价）、项目、文档、普通图片上传与大文件分片上传。" +
        " 所有业务接口都在 /api/v1 前缀下。无版本的 /api 别名已下线，破坏性变更只通过抬版本号发布。",
    },
    servers: [
      { url: "http://127.0.0.1:3000", description: "本地 API 服务" },
      { url: "http://127.0.0.1:2027", description: "Docker Nginx 网关" },
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
        ...responseComponentSchemas(),
        // 探针不使用 { code, message, data } 信封，单独声明真实结构。
        HealthBody: {
          type: "object",
          properties: {
            status: { type: "string", const: "ok" },
          },
          required: ["status"],
          additionalProperties: false,
        },
        ReadyChecks: {
          type: "object",
          properties: {
            mysql: { type: "string", enum: ["ok", "failed"] },
            redis: { type: "string", enum: ["ok", "failed", "disabled"] },
          },
          required: ["mysql", "redis"],
          additionalProperties: false,
        },
        ReadyBody: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["ready", "not_ready"] },
            checks: schemaRef("ReadyChecks"),
            message: { type: "string" },
          },
          required: ["status", "checks"],
          additionalProperties: false,
        },
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["探针"],
          summary: "存活探针",
          responses: {
            "200": jsonResponse("进程存活；不访问 MySQL/Redis", schemaRef("HealthBody")),
          },
        },
      },
      "/ready": {
        get: {
          tags: ["探针"],
          summary: "就绪探针",
          responses: {
            "200": jsonResponse("依赖就绪；关闭黑名单时 redis 为 disabled", schemaRef("ReadyBody")),
            "503": jsonResponse("依赖不可用", schemaRef("ReadyBody")),
          },
        },
      },
      "/api/v1/register": {
        post: {
          tags: ["认证"],
          summary: "注册用户",
          requestBody: jsonRequestBody(registerSchema.shape.body),
          responses: ok("注册成功；不自动登录，data 为 null", "NullDataBody", { errors: ["409"] }),
        },
      },
      "/api/v1/login": {
        post: {
          tags: ["认证"],
          summary: "用户登录",
          requestBody: jsonRequestBody(loginSchema.shape.body),
          responses: ok("登录成功，返回 accessToken、refreshToken，并写入 httpOnly cookie", "AuthTokenPairBody", {
            errors: ["401"],
          }),
        },
      },
      "/api/v1/refresh": {
        post: {
          tags: ["认证"],
          summary: "刷新 access token 并轮换 refresh token",
          requestBody: jsonRequestBody(refreshSchema.shape.body),
          responses: ok("刷新成功，返回新的 accessToken、refreshToken，并写入 httpOnly cookie", "AuthTokenPairBody", {
            // 403：refresh token 来自 cookie 时缺少或不匹配 X-CSRF-Token
            errors: ["401", "403"],
          }),
        },
      },
      "/api/v1/logout": {
        post: {
          tags: ["认证"],
          summary: "退出登录",
          security: bearerAuth(),
          requestBody: jsonRequestBody(logoutSchema.shape.body),
          responses: ok("退出登录成功，data 为 null", "NullDataBody", { errors: ["401"] }),
        },
      },
      "/api/v1/me": {
        get: {
          tags: ["当前用户"],
          summary: "获取当前用户",
          security: bearerAuth(),
          responses: ok("当前用户基础资料", "MeBody", { errors: ["401"] }),
        },
      },
      "/api/v1/me/profile": {
        get: {
          tags: ["当前用户"],
          summary: "获取当前用户扩展资料",
          security: bearerAuth(),
          responses: ok("当前用户扩展资料；从未填写过时 profile 为 null", "ProfileBody", { errors: ["401"] }),
        },
        patch: {
          tags: ["当前用户"],
          summary: "更新当前用户扩展资料",
          security: bearerAuth(),
          requestBody: jsonRequestBody(patchMyProfileSchema.shape.body),
          responses: ok("更新后的当前用户扩展资料", "UpdatedProfileBody", { errors: ["401"] }),
        },
      },
      "/api/v1/content/news": {
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
          responses: ok("本地化新闻列表（摘要，不含正文）", "NewsListBody"),
        },
        post: {
          tags: ["公开内容"],
          summary: "创建新闻",
          security: bearerAuth(),
          requestBody: jsonRequestBody(createNewsSchema.shape.body),
          responses: ok("创建新闻成功，回显未折叠的双语原文", "NewsSourceBody", {
            created: true,
            errors: ["401", "409"],
          }),
        },
      },
      "/api/v1/content/pricing": {
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
          responses: ok("本地化定价页内容", "PricingBody"),
        },
      },
      "/api/v1/content/news/{slug}": {
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
          responses: ok("本地化新闻详情（含正文段落）", "NewsArticleBody", { errors: ["404"] }),
        },
        patch: {
          tags: ["公开内容"],
          summary: "更新新闻",
          security: bearerAuth(),
          parameters: [
            {
              name: "slug",
              in: "path",
              required: true,
              schema: zodInputSchema(newsSlugSchema.shape.params.shape.slug),
            },
          ],
          requestBody: jsonRequestBody(patchNewsSchema.shape.body),
          responses: ok("更新新闻成功，回显未折叠的双语原文", "NewsSourceBody", { errors: ["401", "404"] }),
        },
        delete: {
          tags: ["公开内容"],
          summary: "删除新闻",
          security: bearerAuth(),
          parameters: [
            {
              name: "slug",
              in: "path",
              required: true,
              schema: zodInputSchema(newsSlugSchema.shape.params.shape.slug),
            },
          ],
          responses: ok("删除新闻成功，data 为 null", "NullDataBody", { errors: ["401", "404"] }),
        },
      },
      "/api/v1/projects": {
        get: {
          tags: ["项目"],
          summary: "获取当前用户项目列表（分页）",
          security: bearerAuth(),
          parameters: paginationParams(),
          responses: ok("当前用户项目列表，data 含 projects 与 pagination", "ProjectListBody", {
            errors: ["401"],
          }),
        },
        post: {
          tags: ["项目"],
          summary: "创建项目并初始化文档",
          security: bearerAuth(),
          requestBody: jsonRequestBody(createProjectSchema.shape.body),
          responses: ok("创建项目成功，同时返回同事务里初始化出的文档", "ProjectCreatedBody", {
            created: true,
            errors: ["401"],
          }),
        },
      },
      "/api/v1/projects/{projectId}": {
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
          responses: ok("项目详情", "ProjectBody", { errors: ["401", "404"] }),
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
          responses: ok("更新项目成功", "ProjectBody", { errors: ["401", "404"] }),
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
          responses: ok("删除项目成功，data 为 null", "NullDataBody", { errors: ["401", "404"] }),
        },
      },
      "/api/v1/documents/{documentId}": {
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
          responses: ok("文档详情", "DocumentBody", { errors: ["401", "404"] }),
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
          responses: ok("保存文档成功", "DocumentBody", { errors: ["401", "404"] }),
        },
      },
      "/api/v1/uploads": {
        post: {
          tags: ["上传"],
          summary: "上传通用图片",
          security: bearerAuth(),
          requestBody: multipartRequestBody("files", true),
          responses: ok("上传通用图片，返回 /uploads/common/... 相对 URL", "ImageUploadBody", {
            errors: ["401"],
          }),
        },
      },
      "/api/v1/uploads/profiles": {
        post: {
          tags: ["上传"],
          summary: "上传用户头像/资料图",
          security: bearerAuth(),
          requestBody: multipartRequestBody("files", true),
          responses: ok("上传用户头像/资料图，返回 /uploads/profiles/... 相对 URL", "ImageUploadBody", {
            errors: ["401"],
          }),
        },
      },
      "/api/v1/uploads/large/init": {
        post: {
          tags: ["上传"],
          summary: "创建大文件分片上传任务",
          security: bearerAuth(),
          requestBody: jsonRequestBody(largeUploadInitSchema.shape.body),
          responses: ok("创建上传任务；MD5 命中时 instant 为 true 并直接返回 publicUrl", "LargeUploadInitResultBody", {
            // init 自身不做归属或状态校验，因此没有 403/404/409/410
            errors: ["401"],
          }),
        },
      },
      "/api/v1/uploads/large/{uploadId}/status": {
        get: {
          tags: ["上传"],
          summary: "查询大文件上传状态",
          security: bearerAuth(),
          parameters: [uploadIdParam()],
          responses: ok("查询上传状态；receivedIndices 用于断点续传", "LargeUploadStatusBody", {
            errors: ["401", "403", "404", "410"],
          }),
        },
      },
      "/api/v1/uploads/large/{uploadId}/chunks/{chunkIndex}": {
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
          responses: ok("分片已接收，回显 chunkIndex", "ChunkAcceptedBody", {
            errors: ["401", "403", "404", "409", "410"],
          }),
        },
      },
      "/api/v1/uploads/large/{uploadId}/merge": {
        post: {
          tags: ["上传"],
          summary: "合并大文件分片",
          security: bearerAuth(),
          parameters: [uploadIdParam()],
          responses: ok("合并完成；merged 为 false 表示此前已合并过的幂等重放", "LargeUploadMergeBody", {
            errors: ["401", "403", "404", "409", "410"],
          }),
        },
      },
      "/api/v1/uploads/large/{uploadId}": {
        delete: {
          tags: ["上传"],
          summary: "取消大文件上传任务",
          security: bearerAuth(),
          parameters: [uploadIdParam()],
          responses: ok("已取消；data 为空对象而非 null", "EmptyDataBody", {
            // 没有 404：取消是幂等的，任务不存在或已清理时同样返回成功（见 abortLargeUpload）
            errors: ["401", "403"],
          }),
        },
      },
    },
  };
}

export function openApiYaml(): string {
  return `${yaml.dump(generateOpenApiSpec(), { lineWidth: 120, noRefs: true, sortKeys: false })}`;
}
