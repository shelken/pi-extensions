import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import copyCut from "../index.ts";

describe("copy-cut extension", () => {
  it("registers alt+shift+x shortcut", () => {
    const shortcuts: string[] = [];
    const pi = {
      registerShortcut: vi.fn((shortcut: string) => shortcuts.push(shortcut)),
    } as unknown as ExtensionAPI;

    copyCut(pi);

    expect(shortcuts).toEqual(["alt+shift+x"]);
  });

  it("no-ops when editor is empty", async () => {
    let handler: ((ctx: unknown) => Promise<void>) | undefined;
    const pi = {
      registerShortcut: vi.fn(
        (_shortcut: string, options: { handler: (ctx: unknown) => Promise<void> }) => {
          handler = options.handler;
        },
      ),
    } as unknown as ExtensionAPI;

    copyCut(pi);

    const setEditorText = vi.fn();
    const notify = vi.fn();
    await handler!({
      ui: {
        getEditorText: () => "",
        setEditorText,
        notify,
      },
    });

    expect(setEditorText).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
