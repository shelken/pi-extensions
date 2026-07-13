import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import dynamicModels, { getConfigPaths } from "../index.ts";

describe("pi-dynamic-models extension", () => {
  it("registers the session event", () => {
    const on = vi.fn();

    dynamicModels({ on } as unknown as ExtensionAPI);

    expect(on).toHaveBeenCalledOnce();
    expect(on).toHaveBeenCalledWith("session_start", expect.any(Function));
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
