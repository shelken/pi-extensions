import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import dynamicModels, { getConfigPaths } from "../index.ts";

describe("pi-dynamic-models extension", () => {
  it("eager path, hooks session_start, registers /dynamic-models", () => {
    const on = vi.fn();
    const registerProvider = vi.fn();
    const registerCommand = vi.fn();

    dynamicModels({ on, registerProvider, registerCommand } as unknown as ExtensionAPI);

    expect(on).toHaveBeenCalledOnce();
    expect(on).toHaveBeenCalledWith("session_start", expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith(
      "dynamic-models",
      expect.objectContaining({ handler: expect.any(Function) }),
    );
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
