import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import dynamicModels, { filterNewModelIds, getConfigPaths } from "../index.ts";

describe("pi-dynamic-models extension", () => {
  it("hooks session_start and may eager-register from disk cache", () => {
    const on = vi.fn();
    const registerProvider = vi.fn();

    dynamicModels({ on, registerProvider } as unknown as ExtensionAPI);

    expect(on).toHaveBeenCalledOnce();
    expect(on).toHaveBeenCalledWith("session_start", expect.any(Function));
    // factory 只读磁盘；有 enableProviders + provider cache 时会同步 registerProvider
    for (const [name, config] of registerProvider.mock.calls) {
      expect(typeof name).toBe("string");
      expect(config).toMatchObject({ baseUrl: expect.any(String), models: expect.any(Array) });
      expect(config.models.length).toBeGreaterThan(0);
    }
  });
});

describe("pi-dynamic-models config paths", () => {
  it("uses the standard global and project extension config paths", () => {
    expect(getConfigPaths("/repo/app", "/home/me")).toEqual([
      "/home/me/.pi/agent/extensions/pi-dynamic-models/config.json",
      "/repo/app/.pi/extensions/pi-dynamic-models/config.json",
    ]);
  });
});

describe("filterNewModelIds", () => {
  it("keeps only ids missing from models.json", () => {
    expect(
      filterNewModelIds(
        ["grok-4.5", "plus/gpt-5.5", "claude-sonnet-4-6"],
        new Set(["plus/gpt-5.5"]),
      ),
    ).toEqual(["grok-4.5", "claude-sonnet-4-6"]);
  });
});
