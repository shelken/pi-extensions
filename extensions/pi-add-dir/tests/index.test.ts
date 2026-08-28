import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import addDirExtension from "../src/index.ts";

function asApi(stub: any): ExtensionAPI {
  // SAFETY: 测试桩只实现被测路径调用的方法，经单次断言收敛到 ExtensionAPI
  return stub as ExtensionAPI;
}

describe("pi-add-dir extension", () => {
  it("registers its events, commands, and tools", () => {
    const events: string[] = [];
    const commands: string[] = [];
    const tools: string[] = [];
    const pi = asApi({
      on: vi.fn((event: string) => events.push(event)),
      registerCommand: vi.fn((name: string) => commands.push(name)),
      registerTool: vi.fn((tool: { name: string }) => tools.push(tool.name)),
    });

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
