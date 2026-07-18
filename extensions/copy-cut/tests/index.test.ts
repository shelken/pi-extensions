import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import copyCut, { isCutInput } from "../index.ts";

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
    const pi = {
      registerShortcut: vi.fn((shortcut: string) => shortcuts.push(shortcut)),
      on: vi.fn((event: string) => events.push(event)),
    } as unknown as ExtensionAPI;

    copyCut(pi);

    expect(shortcuts).toEqual(["alt+shift+x"]);
    expect(events).toEqual(["session_start"]);
  });

  it("consumes cut input and clears editor", async () => {
    let sessionHandler: ((event: unknown, ctx: unknown) => Promise<void>) | undefined;
    const pi = {
      registerShortcut: vi.fn(),
      on: vi.fn((event: string, handler: (event: unknown, ctx: unknown) => Promise<void>) => {
        if (event === "session_start") sessionHandler = handler;
      }),
    } as unknown as ExtensionAPI;

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
    await vi.waitFor(() => {
      expect(editor).toBe("");
    });
    expect(notify).toHaveBeenCalledWith("Cut editor text", "info");
  });
});
