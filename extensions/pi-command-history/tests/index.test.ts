import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import commandHistory from "../src/index.ts";

function asApi(stub: any): ExtensionAPI {
  // SAFETY: 测试桩只实现被测路径调用的方法，经单次断言收敛到 ExtensionAPI
  return stub as ExtensionAPI;
}

describe("pi-command-history extension", () => {
  it("registers history events and shortcuts", () => {
    const events: string[] = [];
    const shortcuts: string[] = [];
    const pi = asApi({
      on: vi.fn((event: string) => events.push(event)),
      registerShortcut: vi.fn((shortcut: string) => shortcuts.push(shortcut)),
    });

    commandHistory(pi);

    expect(events).toEqual(["session_start", "input"]);
    expect(shortcuts).toEqual(["shift+up", "shift+down"]);
  });
});
