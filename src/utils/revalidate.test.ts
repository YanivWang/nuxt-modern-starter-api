/**
 * 文件职责：revalidate 工具单测。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

describe("revalidate utils", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns localized news paths for a slug", async () => {
    const { getNewsRevalidatePaths } = await import("./revalidate.js");

    expect(getNewsRevalidatePaths("starter-release")).toEqual([
      "/news",
      "/news/starter-release",
      "/en/news",
      "/en/news/starter-release",
    ]);
  });

  it("posts revalidation requests when configured", async () => {
    vi.stubEnv("NUXT_REVALIDATE_URL", "http://localhost:3000/api/revalidate");
    vi.stubEnv("REVALIDATE_SECRET", "test-secret");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const module = await import("./revalidate.js");
    await module.revalidatePaths(["/news", "/news/demo"]);

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/api/revalidate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-revalidate-secret": "test-secret",
      },
      body: JSON.stringify({ paths: ["/news", "/news/demo"] }),
    });
  });

  it("skips revalidation when url is not configured", async () => {
    vi.stubEnv("NUXT_REVALIDATE_URL", "");
    vi.stubEnv("REVALIDATE_SECRET", "test-secret");

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const module = await import("./revalidate.js");
    await module.revalidatePaths(["/news"]);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
