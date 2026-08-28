import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import copyCut, { isCutInput } from "../src/index.ts";

function asApi(stub: any): ExtensionAPI {
  // SAFETY: 测试桩只实现被测路径调用的方法，经单次断言收敛到 ExtensionAPI
  return stub as ExtensionAPI;
}

// vitest 4 移除了 vi.waitFor：轮询断言直到通过或超时
async function waitFor(check: () => void | Promise<void>, timeout = 1000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      await check();
      return;
    } catch (err) {
      if (Date.now() - start > timeout) throw err;
      await new Promise((done) => setTimeout(done, 20));
    }
  }
}

describe("isCutInput", () => {
  it("matches encodings that actually reach the process", () => {
    expect(isCutInput("\x1b[120;4u")).toBe(true);
    expect(isCutInput("\x1b[27;4;120~")).toBe(true);
    expect(isCutInput("\x1bX")).toBe(true);
    expect(isCutInput("˛")).toBe(true);
  });

  it("rejects unrelated input", () => {
    expect(isCutInput("x")).toBe(false);
    expect(isCutInput("X")).toBe(false);
    expect(isCutInput("\x1bx")).toBe(false);
    expect(isCutInput("\x18")).toBe(false);
    expect(isCutInput("\x1b[120;7u")).toBe(false); // ctrl+alt+x
    expect(isCutInput("≈")).toBe(false);
  });
});

describe("copy-cut extension", () => {
  it("registers shortcut and session_start listener", () => {
    const shortcuts: string[] = [];
    const events: string[] = [];
    const pi = asApi({
      registerShortcut: vi.fn((shortcut: string) => shortcuts.push(shortcut)),
      on: vi.fn((event: string) => events.push(event)),
    });

    copyCut(pi);

    expect(shortcuts).toEqual(["alt+shift+x"]);
    expect(events).toEqual(["session_start"]);
  });

  it("consumes cut input and clears editor", async () => {
    // 事件/上下文参数在测试中仅透传，从宽声明
    let sessionHandler:
      | ((event: any, ctx: any) => Promise<void>)
      | undefined;
    const pi = asApi({
      registerShortcut: vi.fn(),
      on: vi.fn((event: string, handler: (event: any, ctx: any) => Promise<void>) => {
        if (event === "session_start") sessionHandler = handler;
      }),
    });

    copyCut(pi);

    let inputHandler: ((data: string) => { consume?: boolean } | undefined) | undefined;
    let editor = "hello cut";
    const notify = vi.fn();

    await sessionHandler!({}, {
      hasUI: true,
      ui: {
        onTerminalInput: (handler: typeof inputHandler) => {
          inputHandler = handler;
          return () => {};
        },
        getEditorText: () => editor,
        setEditorText: (text: string) => {
          editor = text;
        },
        notify,
      },
    });

    expect(inputHandler!("x")).toBeUndefined();
    expect(inputHandler!("\x1bX")).toEqual({ consume: true });
    await waitFor(() => {
      expect(editor).toBe("");
    });
    expect(notify).toHaveBeenCalledWith("Cut editor text", "info");
  });
});
