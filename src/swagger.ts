import { readFileSync } from "node:fs";
import { join } from "node:path";

import yaml from "js-yaml";
import swaggerUi from "swagger-ui-express";

import { projectRoot } from "./utils/projectRoot.js";

import type { Application } from "express";

const openApiPath = join(projectRoot, "docs", "openapi.yaml");

export function loadOpenApiSpec(): Record<string, unknown> {
  const raw = readFileSync(openApiPath, "utf8");
  const spec = yaml.load(raw);
  if (!spec || typeof spec !== "object") {
    throw new Error("[swagger] openapi.yaml 解析结果无效");
  }
  return spec as Record<string, unknown>;
}

export function setupSwagger(app: Application, path = "/api-docs") {
  const spec = loadOpenApiSpec();

  app.get("/openapi.yaml", (_req, res) => {
    res.type("application/yaml");
    res.send(readFileSync(openApiPath, "utf8"));
  });

  app.use(path, swaggerUi.serve, swaggerUi.setup(spec));
}
