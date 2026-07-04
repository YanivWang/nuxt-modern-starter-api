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
    res.type("application/yaml");
    res.send(openApiYaml());
  });

  app.use(path, swaggerUi.serve, swaggerUi.setup(spec));
}
