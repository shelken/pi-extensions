import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import piGuard from "../src/index.ts";

// 隔离开发者真实 agent 目录（getAgentDir 读 PI_CODING_AGENT_DIR），不读写真实 permissions.yaml
const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
let agentDir: string;
beforeAll(() => {
  agentDir = mkdtempSync(join(tmpdir(), "pi-guard-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
});
afterAll(() => {
  rmSync(agentDir, { recursive: true, force: true });
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
});

function asApi(stub: any): ExtensionAPI {
  // SAFETY: 测试桩只实现被测路径调用的方法，经单次断言收敛到 ExtensionAPI
  return stub as ExtensionAPI;
}

function install() {
  const handlers = new Map<string, Function>();
  const on = vi.fn((event: string, handler: Function) => {
    handlers.set(event, handler);
  });
  piGuard(asApi({ on }));
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

  it("blocks credential collection through tool_call", async () => {
    const handlers = install();
    const toolCall = handlers.get("tool_call")!;
    const sessionStart = handlers.get("session_start")!;
    const ctx = {
      cwd: "/tmp/pi-guard-empty-proj",
      hasUI: false,
      ui: { notify: vi.fn() },
    };

    sessionStart({}, ctx);

    for (const event of [
      {
        type: "tool_call",
        toolCallId: "env",
        toolName: "bash",
        input: { command: "env" },
      },
      {
        type: "tool_call",
        toolCallId: "credentials",
        toolName: "read",
        input: { path: "~/.netrc" },
      },
    ]) {
      expect((await toolCall(event, ctx))?.block, event.toolCallId).toBe(true);
    }
  });

  it("blocks grep/find/ls accessing sensitive paths via path field", async () => {
    const handlers = install();
    const toolCall = handlers.get("tool_call")!;
    const sessionStart = handlers.get("session_start")!;
    const ctx = {
      cwd: "/tmp/pi-guard-empty-proj",
      hasUI: false,
      ui: { notify: vi.fn() },
    };
    sessionStart({}, ctx);

    for (const toolName of ["grep", "find", "ls"]) {
      const result = await toolCall(
        {
          type: "tool_call",
          toolCallId: toolName,
          toolName,
          input: { pattern: "x", path: "~/.ssh/id_rsa" },
        },
        ctx,
      );
      expect(result?.block, toolName).toBe(true);
    }
  });

  it("does not block tools without a path field", async () => {
    const handlers = install();
    const toolCall = handlers.get("tool_call")!;
    const result = await toolCall(
      {
        type: "tool_call",
        toolCallId: "1",
        toolName: "grep",
        input: { pattern: "~/.ssh" },
      },
      { cwd: "/tmp", hasUI: false, ui: { notify: vi.fn() } },
    );
    expect(result).toBeUndefined();
  });
});
