import { describe, expect, it } from "vitest";
import { getConfigPaths } from "./index.ts";

describe("pi-auto-model-prompts config paths", () => {
  it("uses the standard global and project extension config paths", () => {
    expect(getConfigPaths("/repo/app", "/home/me")).toEqual([
      "/home/me/.pi/agent/extensions/pi-auto-model-prompts/config.json",
      "/repo/app/.pi/extensions/pi-auto-model-prompts/config.json",
    ]);
  });
});
