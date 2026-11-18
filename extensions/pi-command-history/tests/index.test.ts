import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

  it("只记录用户输入，跳过扩展注入的消息", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cmd-hist-home-"));
    const oldHome = process.env.HOME;
    process.env.HOME = home;
    try {
      vi.resetModules();
      const { default: factory, HISTORY_DIR, loadHistory } = await import("../src/index.ts");
      expect(HISTORY_DIR.startsWith(home)).toBe(true);

      const handlers: Record<string, (event: any, ctx: any) => unknown> = {};
      const pi = asApi({
        on: vi.fn((event: string, handler: (event: any, ctx: any) => unknown) => {
          handlers[event] = handler;
        }),
        registerShortcut: vi.fn(),
      });
      factory(pi);

      handlers.session_start({}, { cwd: "/tmp/demo-project" });
      handlers.input({ type: "input", text: "from-extension", source: "extension" }, {});
      handlers.input({ type: "input", text: "from-user", source: "interactive" }, {});

      expect(loadHistory("/tmp/demo-project")).toEqual(["from-user"]);
    } finally {
      if (oldHome === undefined) delete process.env.HOME;
      else process.env.HOME = oldHome;
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
