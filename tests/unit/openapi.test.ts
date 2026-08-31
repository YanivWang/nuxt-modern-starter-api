/**
 * 文件职责：OpenAPI 生成测试。
 * 验证文档 schema 复用 Zod 规则、每个业务响应都描述出真实 payload 形状，
 * 并确保 docs/openapi.yaml 与运行时生成结果保持同步。
 */
import fs from "node:fs";
import path from "node:path";

import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

import { projectRoot } from "../../src/utils/projectRoot.js";

type TestOpenApiSchema = {
  properties?: Record<string, TestOpenApiSchema>;
  required?: string[];
} & Record<string, unknown>;

function expectProperties(schema: TestOpenApiSchema) {
  expect(schema.properties).toBeDefined();
  return schema.properties as Record<string, TestOpenApiSchema>;
}

function expectJsonRequestSchema(operation: {
  requestBody?: { content: Record<string, { schema: TestOpenApiSchema }> };
}) {
  expect(operation.requestBody).toBeDefined();
  return operation.requestBody?.content["application/json"].schema as TestOpenApiSchema;
}

/**
 * 带路径参数但不会 404 的端点。
 * 取消上传任务是幂等的：任务不存在或已被清理时同样返回成功，客户端重复取消不该收到错误。
 */
const NO_NOT_FOUND = new Set(["DELETE /api/v1/uploads/large/{uploadId}"]);

describe("openapi generation", () => {
  it("builds request schemas from zod validation schemas", async () => {
    const { generateOpenApiSpec } = await import("../../src/openapi.js");

    const spec = generateOpenApiSpec();
    const registerBody = expectJsonRequestSchema(spec.paths["/api/v1/register"].post);
    const largeUploadBody = expectJsonRequestSchema(spec.paths["/api/v1/uploads/large/init"].post);
    const registerProperties = expectProperties(registerBody);
    const largeUploadProperties = expectProperties(largeUploadBody);

    expect(registerProperties.username).toMatchObject({
      type: "string",
      minLength: 2,
      maxLength: 100,
    });
    expect(registerBody.required).toContain("password");
    expect(largeUploadProperties.fileMd5).toMatchObject({
      type: "string",
      minLength: 32,
      maxLength: 32,
      pattern: "^[a-fA-F0-9]{32}$",
    });
    expect(spec.components.schemas.ErrorBody).toMatchObject({
      additionalProperties: false,
      required: ["code", "message", "data"],
    });
    expect(spec.paths["/api/v1/register"].post.responses["400"].content?.["application/json"].schema).toMatchObject({
      $ref: "#/components/schemas/ErrorBody",
    });
  });

  it("describes a real payload shape for every business response", async () => {
    const { generateOpenApiSpec } = await import("../../src/openapi.js");

    const spec = generateOpenApiSpec();
    const undescribed: string[] = [];

    for (const [routePath, operations] of Object.entries(spec.paths)) {
      // 探针不走 { code, message, data } 信封，不适用这条规则
      if (!routePath.startsWith("/api/")) continue;

      for (const [method, operation] of Object.entries(operations)) {
        const endpoint = `${method.toUpperCase()} ${routePath}`;
        const success = Object.entries(operation.responses).find(([status]) => status.startsWith("2"));
        const ref = success?.[1].content?.["application/json"].schema.$ref;

        if (typeof ref !== "string") {
          undescribed.push(`${endpoint}（成功响应没有引用 component）`);
          continue;
        }

        const body = spec.components.schemas[ref.slice("#/components/schemas/".length)];
        const data = body?.properties?.data;

        // 回归守卫：这里曾经统一是 data: {}，也就是「请求描述得很完整、响应完全没描述」。
        // 空对象在 JSON Schema 里等价于「任意值」，契约测试因此只能挡住路径漂移，挡不住字段漂移。
        if (!data || Object.keys(data).length === 0) {
          undescribed.push(`${endpoint}（data 未描述形状）`);
        }
      }
    }

    expect(undescribed, "这些业务响应没有描述 payload 形状").toEqual([]);
  });

  it("pins the success envelope code to the literal 200", async () => {
    const { generateOpenApiSpec } = await import("../../src/openapi.js");

    const spec = generateOpenApiSpec();

    // 业务成功恒为 200，HTTP status 才用 201 表达「已创建」。
    // 写成任意整数会让前端的 assertApiSuccess 失去契约依据。
    expect(spec.components.schemas.ProjectListBody.properties?.code).toMatchObject({ const: 200 });
    expect(spec.paths["/api/v1/projects"].post.responses["201"]).toBeDefined();
    expect(spec.paths["/api/v1/projects"].post.responses["200"]).toBeUndefined();
  });

  it("declares the error statuses that each endpoint can actually return", async () => {
    const { generateOpenApiSpec } = await import("../../src/openapi.js");

    const spec = generateOpenApiSpec();
    const missing: string[] = [];

    for (const [routePath, operations] of Object.entries(spec.paths)) {
      if (!routePath.startsWith("/api/")) continue;

      for (const [method, operation] of Object.entries(operations)) {
        const endpoint = `${method.toUpperCase()} ${routePath}`;
        const declared = new Set(Object.keys(operation.responses));

        // 挂了 authMiddleware 的端点一定会 401；这条是机械可推的，不该靠人记得写
        if (operation.security && !declared.has("401")) {
          missing.push(`${endpoint} 需要鉴权却没声明 401`);
        }

        // 带路径参数的端点都要按 id 取资源，取不到（或不属于当前用户）一律 404。
        // 例外必须写明理由：这条规则是启发式的，而契约只有在逐条对得上真实行为时才有意义。
        if (routePath.includes("{") && !declared.has("404") && !NO_NOT_FOUND.has(endpoint)) {
          missing.push(`${endpoint} 带路径参数却没声明 404`);
        }

        // 通用三件套：校验中间件、限流、兜底
        for (const status of ["400", "429", "500"]) {
          if (!declared.has(status)) missing.push(`${endpoint} 没声明 ${status}`);
        }
      }
    }

    expect(missing, "这些端点的错误响应声明与真实行为不符").toEqual([]);
  });

  it("keeps docs/openapi.yaml in sync with the generated spec", async () => {
    const { openApiYaml } = await import("../../src/openapi.js");
    const current = fs.readFileSync(path.join(projectRoot, "docs", "openapi.yaml"), "utf8");

    expect(yaml.load(current)).toEqual(yaml.load(openApiYaml()));
  });
});
