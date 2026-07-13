import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import addDirExtension from "../index.ts";

describe("pi-add-dir extension", () => {
  it("registers its events, commands, and tools", () => {
    const events: string[] = [];
    const commands: string[] = [];
    const tools: string[] = [];
    const pi = {
      on: vi.fn((event: string) => events.push(event)),
      registerCommand: vi.fn((name: string) => commands.push(name)),
      registerTool: vi.fn((tool: { name: string }) => tools.push(tool.name)),
    } as unknown as ExtensionAPI;

    addDirExtension(pi);

    expect(events).toEqual([
      "resources_discover",
      "session_start",
      "session_tree",
      "session_shutdown",
      "before_agent_start",
    ]);
    expect(commands).toEqual(["add-dir", "remove-dir", "dirs"]);
    expect(tools).toEqual(["add_directory", "search_external_files"]);
  });
});
