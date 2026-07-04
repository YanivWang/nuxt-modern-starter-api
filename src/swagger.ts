/**
 * 文件职责：挂载 Swagger UI 与运行时 OpenAPI YAML。
 * 注意运行时 YAML 便于调试，仓库内 docs/openapi.yaml 仍需通过脚本生成并提交。
 */
import yaml from "js-yaml";
import swaggerUi from "swagger-ui-express";

import { generateOpenApiSpec, openApiYaml } from "./openapi.js";

import type { Application } from "express";

export function loadOpenApiSpec(): Record<string, unknown> {
  const spec = yaml.load(openApiYaml());
  if (!spec || typeof spec !== "object") {
    throw new Error("[swagger] generated OpenAPI spec is invalid");
  }
  return spec as Record<string, unknown>;
}

export function setupSwagger(app: Application, path = "/api-docs") {
  const spec = generateOpenApiSpec();

  app.get("/openapi.yaml", (_req, res) => {
    // 运行时 YAML 与 docs/openapi.yaml 使用同一个生成函数；修改接口后仍需 openapi:generate 固化到仓库。
    res.type("application/yaml");
    res.send(openApiYaml());
  });

  app.use(path, swaggerUi.serve, swaggerUi.setup(spec));
}
