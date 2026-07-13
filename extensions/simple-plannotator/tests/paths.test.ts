import { describe, expect, it } from "vitest";
import { homedir } from "node:os";
import { expandHomePath, normalizeUserPath } from "../index.ts";

describe("path helpers", () => {
  it("展开 ~", () => {
    expect(expandHomePath("~")).toBe(homedir());
    expect(expandHomePath("~/docs")).toBe(`${homedir()}/docs`);
  });

  it("normalize 去掉引号和 @", () => {
    expect(normalizeUserPath('"~/a.md"')).toBe(`${homedir()}/a.md`);
    expect(normalizeUserPath("@README.md")).toBe("README.md");
  });
});
