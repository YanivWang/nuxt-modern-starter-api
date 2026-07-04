import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function importFreshEnv(env: NodeJS.ProcessEnv) {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV, ...env };
  return import("./env.js");
}

afterEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

describe("redis env configuration", () => {
  it("allows REDIS_URL to be omitted when auth token blacklist is disabled", async () => {
    await expect(
      importFreshEnv({
        APP_ENV: "development",
        NODE_ENV: "development",
        JWT_SECRET: "a".repeat(32),
        DB_HOST: "127.0.0.1",
        DB_USER: "app_user",
        DB_PWD: "app_password_123456",
        DB_NAME: "express_modern_starter",
        REDIS_URL: "",
        AUTH_TOKEN_BLACKLIST_ENABLED: "false",
      }),
    ).resolves.toMatchObject({
      AUTH_TOKEN_BLACKLIST_ENABLED: false,
      REDIS_URL: undefined,
    });
  });

  it("requires REDIS_URL by default in production", async () => {
    await expect(
      importFreshEnv({
        APP_ENV: "production",
        NODE_ENV: "production",
        JWT_SECRET: "a".repeat(32),
        DB_HOST: "mysql",
        DB_USER: "app_user",
        DB_PWD: "app_password_123456",
        DB_NAME: "express_modern_starter",
        CORS_ORIGINS: "https://example.com",
        REDIS_URL: "",
      }),
    ).rejects.toThrow();
  });

  it("makes jwt blacklist operations no-op when redis is disabled", async () => {
    await importFreshEnv({
      APP_ENV: "development",
      NODE_ENV: "development",
      JWT_SECRET: "a".repeat(32),
      DB_HOST: "127.0.0.1",
      DB_USER: "app_user",
      DB_PWD: "app_password_123456",
      DB_NAME: "express_modern_starter",
      REDIS_URL: "",
      AUTH_TOKEN_BLACKLIST_ENABLED: "false",
    });

    const { blacklistJwt, isJwtBlacklisted } = await import("./services/auth-token.service.js");

    await expect(blacklistJwt("token-id", 60)).resolves.toBeUndefined();
    await expect(isJwtBlacklisted("token-id")).resolves.toBe(false);
  });
});
