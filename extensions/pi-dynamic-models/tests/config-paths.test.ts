import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import dynamicModels, { getConfigPaths } from "../src/index.ts";

function asApi(stub: any): ExtensionAPI {
  // SAFETY: 测试桩只实现被测路径调用的方法（on/registerProvider/registerCommand）
  return stub as ExtensionAPI;
}

describe("pi-dynamic-models extension", () => {
  it("eager path, hooks session_start, registers /dynamic-models", () => {
    const on = vi.fn();
    const registerProvider = vi.fn();
    const registerCommand = vi.fn();

    dynamicModels(asApi({ on, registerProvider, registerCommand }));

    expect(on).toHaveBeenCalledOnce();
    expect(on).toHaveBeenCalledWith("session_start", expect.any(Function));
    expect(registerCommand).toHaveBeenCalledWith(
      "dynamic-models",
      expect.objectContaining({
        handler: expect.any(Function),
        getArgumentCompletions: expect.any(Function),
      }),
    );
    for (const [name, config] of registerProvider.mock.calls) {
      expect(name).toBeTypeOf("string");
      // eager 注册依赖真实磁盘缓存（环境条件式）；无缓存时跳过断言
      if (!config?.models) continue;
      expect(config).toMatchObject({
        baseUrl: expect.any(String),
        models: expect.any(Array),
      });
      if (config.models.length > 0) {
        expect(config.models[0]).toBeTypeOf("object");
      }
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
