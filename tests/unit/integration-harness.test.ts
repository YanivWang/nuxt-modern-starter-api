/**
 * 文件职责：守住集成测试的 HTTP 夹具约定——每个文件必须复用一个常驻 server。
 *
 * 把 Express app 直接交给 supertest 时，它会为每个请求新建 http.Server + listen(0)、
 * 响应后再 close()。一个文件下来上百个短命 server，CPU 紧张时会出现请求根本没落到 Express 上、
 * 由更底层直接回一个空 404，表现为「断言拿到一个毫不相关的状态码」这类随机失败。
 *
 * 这条守卫值得存在，是因为它精确：集成测试里只有一种正确写法（startTestServer 起的 server），
 * 没有需要豁免的合理例外。定位这个问题花了很久，而重新引入它只需要一行复制粘贴。
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { projectRoot } from "../../src/utils/projectRoot.js";

const integrationDir = path.join(projectRoot, "tests", "integration");

const integrationTestFiles = fs
  .readdirSync(integrationDir)
  .filter((name) => name.endsWith(".integration.test.ts"))
  .map((name) => ({ name, source: fs.readFileSync(path.join(integrationDir, name), "utf8") }));

describe("integration test harness", () => {
  it("finds the integration test files", () => {
    expect(integrationTestFiles.length, "tests/integration 下应当有集成测试文件").toBeGreaterThan(0);
  });

  it("starts one long-lived server per file instead of one per request", () => {
    const offenders = integrationTestFiles
      .filter((file) => !file.source.includes("startTestServer("))
      .map((file) => file.name);

    expect(offenders, "这些集成测试没有用 startTestServer 起常驻 server").toEqual([]);
  });

  it("never hands the express app straight to supertest", () => {
    // request(runtime.app) / supertest(runtime.app) 都会让 supertest 自己起一个一次性 server
    const offenders = integrationTestFiles
      .filter((file) => /\b(?:request|supertest)\(\s*runtime\.app\s*\)/.test(file.source))
      .map((file) => file.name);

    expect(offenders, "这些集成测试把 Express app 直接交给了 supertest，会退回到每请求一个 server").toEqual([]);
  });

  it("closes the server before tearing the runtime down", () => {
    // 顺序反了的话，在途请求会打到已经关闭的数据库/Redis 连接池上
    const offenders = integrationTestFiles
      .filter((file) => {
        const stop = file.source.indexOf("stopTestServer(");
        const disconnect = file.source.indexOf("runtime.disconnect()");
        return stop < 0 || disconnect < 0 || stop > disconnect;
      })
      .map((file) => file.name);

    expect(offenders, "这些集成测试没有在断开 runtime 之前关闭 server").toEqual([]);
  });
});
