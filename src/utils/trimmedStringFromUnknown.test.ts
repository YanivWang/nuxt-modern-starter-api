import { describe, expect, it } from "vitest";

import { trimmedStringFromUnknown } from "./trimmedStringFromUnknown.js";

describe("trimmedStringFromUnknown", () => {
  it("trims strings", () => {
    expect(trimmedStringFromUnknown("  a  ")).toBe("a");
  });

  it("stringifies safe primitives", () => {
    expect(trimmedStringFromUnknown(42)).toBe("42");
    expect(trimmedStringFromUnknown(true)).toBe("true");
  });

  it("returns empty for objects and arrays", () => {
    expect(trimmedStringFromUnknown({})).toBe("");
    expect(trimmedStringFromUnknown([])).toBe("");
    expect(trimmedStringFromUnknown(null)).toBe("");
    expect(trimmedStringFromUnknown(undefined)).toBe("");
  });
});
