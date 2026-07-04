import fs from "node:fs";
import path from "node:path";

import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

import { projectRoot } from "./utils/projectRoot.js";

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

describe("openapi generation", () => {
  it("builds request schemas from zod validation schemas", async () => {
    const { generateOpenApiSpec } = await import("./openapi.js");

    const spec = generateOpenApiSpec();
    const registerBody = expectJsonRequestSchema(spec.paths["/api/register"].post);
    const largeUploadBody = expectJsonRequestSchema(spec.paths["/api/uploads/large/init"].post);
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
  });

  it("keeps docs/openapi.yaml in sync with the generated spec", async () => {
    const { openApiYaml } = await import("./openapi.js");
    const current = fs.readFileSync(path.join(projectRoot, "docs", "openapi.yaml"), "utf8");

    expect(yaml.load(current)).toEqual(yaml.load(openApiYaml()));
  });
});
