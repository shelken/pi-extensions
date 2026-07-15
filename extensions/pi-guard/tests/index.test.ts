import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return {
    ...mod,
    // isolate from developer real ~/.pi/agent/permissions.yaml
    getAgentDir: () => "/tmp/pi-guard-tests-no-agent-dir",
  };
});

import piGuard from "../index.ts";

function install() {
  const handlers = new Map<string, Function>();
  const on = vi.fn((event: string, handler: Function) => {
    handlers.set(event, handler);
  });
  piGuard({ on } as unknown as ExtensionAPI);
  return handlers;
}

describe("pi-guard extension wiring", () => {
  it("registers session_start and tool_call without IO in factory", () => {
    const handlers = install();
    expect(handlers.has("session_start")).toBe(true);
    expect(handlers.has("tool_call")).toBe(true);
  });

  it("blocks builtin bash via tool_call handler", async () => {
    const handlers = install();
    const toolCall = handlers.get("tool_call")!;
    const sessionStart = handlers.get("session_start")!;

    const notify = vi.fn();
    const ctx = {
      cwd: "/tmp/pi-guard-empty-proj",
      hasUI: true,
      ui: { notify },
    };

    // load with missing configs (no real agent dir file needed: getAgentDir may exist)
    sessionStart({}, ctx);

    const result = await toolCall(
      {
        type: "tool_call",
        toolCallId: "1",
        toolName: "bash",
        input: { command: "rm -rf /" },
      },
      ctx,
    );

    expect(result).toEqual({
      block: true,
      reason: "! FORBIDDEN COMMAND\ncommand: rm -rf /",
    });
    // hard block does not notify
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not handle non target tools", async () => {
    const handlers = install();
    const toolCall = handlers.get("tool_call")!;
    const result = await toolCall(
      {
        type: "tool_call",
        toolCallId: "1",
        toolName: "grep",
        input: { pattern: "x", path: "~/.ssh" },
      },
      { cwd: "/tmp", hasUI: false, ui: { notify: vi.fn() } },
    );
    expect(result).toBeUndefined();
  });
});
