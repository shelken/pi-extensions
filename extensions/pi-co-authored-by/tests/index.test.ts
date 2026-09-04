import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import coAuthoredBy from "../src/index.ts";

function asApi(stub: any): ExtensionAPI {
  // SAFETY: 测试桩只实现被测路径调用的方法，经单次断言收敛到 ExtensionAPI
  return stub as ExtensionAPI;
}

describe("pi-co-authored-by extension", () => {
  it("registers its lifecycle and bash hooks", () => {
    const events: string[] = [];
    const pi = asApi({
      on: vi.fn((event: string) => events.push(event)),
    });

    coAuthoredBy(pi);

    expect(events).toEqual(["session_start", "session_shutdown", "tool_call"]);
  });

  it("intercepts git commit tool calls with resolved host and co-author trailer", async () => {
    const handlers: Record<string, Function> = {};
    const pi = asApi({
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler;
      }),
    });

    coAuthoredBy(pi);

    // 初始化 session
    await handlers.session_start?.();

    const toolCallEvent = {
      toolName: "bash",
      input: { command: "git commit -m 'test msg'" },
    };

    const ctx = {
      model: { name: "TestBot" },
      cwd: process.cwd(),
    };

    await handlers.tool_call?.(toolCallEvent, ctx);

    expect(toolCallEvent.input.command).toContain("PI_CO_AUTHORED_BY_CO_AUTHOR=");
    expect(toolCallEvent.input.command).toContain("PI_CO_AUTHORED_BY_GENERATED_BY=");
    expect(toolCallEvent.input.command).toContain("Co-Authored-By: TestBot");

    await handlers.session_shutdown?.();
  });
});
