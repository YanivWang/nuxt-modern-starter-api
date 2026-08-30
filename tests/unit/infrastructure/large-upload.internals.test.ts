/**
 * 文件职责：大文件上传纯逻辑单元测试。
 * 重点是路径逃逸防护与分片边界计算——这两处出错分别意味着任意文件读取和静默的数据损坏。
 */
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  absPathFromPublicUploadUrl,
  expectedPartSize,
  partFileName,
  safeFileBase,
} from "../../../src/infrastructure/storage/large-upload.internals.js";

const ROOT = path.resolve("/srv/app/uploads");

describe("partFileName", () => {
  it("zero-pads so lexical order matches chunk order", () => {
    expect(partFileName(0)).toBe("part-000000.bin");
    expect(partFileName(42)).toBe("part-000042.bin");
    expect([partFileName(2), partFileName(10)].sort()).toEqual([partFileName(2), partFileName(10)]);
  });
});

describe("expectedPartSize", () => {
  const layout = { fileSize: 25, chunkSize: 10, chunkTotal: 3 };

  it("returns the full chunk size for non-final chunks", () => {
    expect(expectedPartSize(layout, 0)).toBe(10);
    expect(expectedPartSize(layout, 1)).toBe(10);
  });

  it("returns the remainder for the final chunk", () => {
    expect(expectedPartSize(layout, 2)).toBe(5);
  });

  it("handles a file that divides evenly", () => {
    expect(expectedPartSize({ fileSize: 30, chunkSize: 10, chunkTotal: 3 }, 2)).toBe(10);
  });

  it("handles a single-chunk file", () => {
    expect(expectedPartSize({ fileSize: 7, chunkSize: 10, chunkTotal: 1 }, 0)).toBe(7);
  });

  it("returns null for out-of-range or non-integer indices", () => {
    expect(expectedPartSize(layout, -1)).toBeNull();
    expect(expectedPartSize(layout, 3)).toBeNull();
    expect(expectedPartSize(layout, 1.5)).toBeNull();
    expect(expectedPartSize(layout, Number.NaN)).toBeNull();
  });
});

describe("safeFileBase", () => {
  it("strips directory components", () => {
    expect(safeFileBase("/etc/passwd")).toBe("passwd");
    expect(safeFileBase("../../secret.txt")).toBe("secret.txt");
  });

  it("replaces characters outside the safe set", () => {
    expect(safeFileBase("my file (1).zip")).toBe("my_file__1_.zip");
  });

  it("falls back to a placeholder when nothing usable remains", () => {
    expect(safeFileBase("")).toBe("file");
    expect(safeFileBase("/")).toBe("file");
  });

  it("caps the length", () => {
    expect(safeFileBase("a".repeat(300))).toHaveLength(120);
  });
});

describe("absPathFromPublicUploadUrl", () => {
  it("resolves a legitimate upload URL under the root", () => {
    expect(absPathFromPublicUploadUrl(ROOT, "/uploads/large/2026/08/file.bin")).toBe(
      path.join(ROOT, "large", "2026", "08", "file.bin"),
    );
  });

  it.each([
    "/uploads/../../etc/passwd",
    "/uploads/large/../../../../etc/passwd",
    "/uploads/..",
    "/etc/passwd",
    "/uploadsx/file.bin",
    "uploads/file.bin",
    "/uploads/",
  ])("rejects %j so a tampered hash index cannot escape the upload root", (url) => {
    expect(absPathFromPublicUploadUrl(ROOT, url)).toBeNull();
  });

  it("tolerates surrounding whitespace and redundant slashes", () => {
    expect(absPathFromPublicUploadUrl(ROOT, "  /uploads/large//file.bin  ")).toBe(path.join(ROOT, "large", "file.bin"));
  });
});
