# Express Starter Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the project a stronger reusable Web App API starter by reducing default Redis coupling, modernizing package-manager config, and documenting extension boundaries.

**Architecture:** Keep the current Express/TypeScript/MySQL/JWT structure, but introduce a small Redis availability boundary so the app can boot without Redis when token blacklist is disabled. Preserve production defaults that require Redis unless explicitly disabled.

**Tech Stack:** Express 4, TypeScript NodeNext, Sequelize/MySQL, optional Redis, Vitest/Supertest, Docker Compose, pnpm 10.

---

### Task 1: Restore Tooling

**Files:**

- Read: `package.json`
- Generated locally: `node_modules/`

- [ ] Run `corepack pnpm install --frozen-lockfile`.
- [ ] If network is blocked, rerun with approved escalation.
- [ ] Confirm `node_modules/.bin/tsc` and `node_modules/.bin/vitest` exist.

### Task 2: Add Redis Optional Behavior Tests

**Files:**

- Create: `src/env.redis.test.ts`
- Modify: `vitest.config.ts`

- [ ] Add isolated environment tests that import `src/env.ts` with `AUTH_TOKEN_BLACKLIST_ENABLED=false` and no `REDIS_URL`, expecting import success.
- [ ] Add isolated environment tests that import `src/env.ts` in production without Redis opt-out, expecting import failure.
- [ ] Ensure tests reset `process.env` between dynamic imports.

### Task 3: Implement Redis Optional Boundary

**Files:**

- Modify: `src/env.ts`
- Modify: `src/redis.ts`
- Modify: `src/server.ts`
- Modify: `src/services/auth-token.service.ts`
- Modify: `src/services/jwt-verify.service.ts`
- Modify: `src/routes/health.routes.ts`

- [ ] Add `AUTH_TOKEN_BLACKLIST_ENABLED` boolean env with default `true`.
- [ ] Require `REDIS_URL` only when token blacklist is enabled.
- [ ] Make Redis connection functions no-op when disabled.
- [ ] Make logout blacklist no-op when disabled.
- [ ] Make JWT verification skip blacklist lookup when disabled.
- [ ] Make `/ready` report Redis as `disabled` when blacklist is disabled.

### Task 4: Modernize pnpm Config and Docs

**Files:**

- Modify: `package.json`
- Create: `pnpm-workspace.yaml`
- Modify: `.env.example`
- Modify: `.env.development`
- Modify: `.env.test`
- Modify: `.env.production.example`
- Modify: `README.md`

- [ ] Move `onlyBuiltDependencies` from `package.json` to `pnpm-workspace.yaml`.
- [ ] Add `AUTH_TOKEN_BLACKLIST_ENABLED` to env examples.
- [ ] Document Redis opt-out, tradeoff, and production recommendation.
- [ ] Update the starter assessment text around multi-instance upload limits and extension points.

### Task 5: Verify

**Files:**

- All changed files

- [ ] Run `corepack pnpm test:unit`.
- [ ] Run `corepack pnpm run typecheck`.
- [ ] Run `corepack pnpm run lint`.
- [ ] Run `corepack pnpm run build`.
- [ ] Note any integration tests skipped because MySQL/Redis services are not running.
