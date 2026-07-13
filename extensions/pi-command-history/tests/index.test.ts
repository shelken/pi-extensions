import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import commandHistory from "../index.ts";

describe("pi-command-history extension", () => {
  it("registers history events and shortcuts", () => {
    const events: string[] = [];
    const shortcuts: string[] = [];
    const pi = {
      on: vi.fn((event: string) => events.push(event)),
      registerShortcut: vi.fn((shortcut: string) => shortcuts.push(shortcut)),
    } as unknown as ExtensionAPI;

    commandHistory(pi);

    expect(events).toEqual(["session_start", "input"]);
    expect(shortcuts).toEqual(["shift+up", "shift+down"]);
  });
});
