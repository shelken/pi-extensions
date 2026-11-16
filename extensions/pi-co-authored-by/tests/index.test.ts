import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  // mise 会把环境透传给子进程，runner 注入的 GIT_CONFIG_* 因此对 `mise exec -- git commit` 同样生效
  it.skipIf(!hasMise())("writes trailers for a real `mise exec -- git commit`", async () => {
    const handlers: Record<string, Function> = {};
    const pi = asApi({
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler;
      }),
    });
    coAuthoredBy(pi);
    await handlers.session_start?.();

    const repo = mkdtempSync(join(tmpdir(), "pi-co-authored-by-mise-"));
    try {
      const toolCallEvent = {
        toolName: "bash",
        input: { command: "mise exec -- git commit --allow-empty -q -m 'via mise'" },
      };
      await handlers.tool_call?.(toolCallEvent, { model: { name: "TestBot" }, cwd: repo });

      const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
      execFileSync("git", ["init", "-q"], { cwd: repo, env });
      execFileSync("git", ["config", "user.name", "Tester"], { cwd: repo, env });
      execFileSync("git", ["config", "user.email", "tester@example.com"], { cwd: repo, env });
      execFileSync("bash", ["-c", `set -euo pipefail\n${toolCallEvent.input.command}`], { cwd: repo, env });

      const message = execFileSync("git", ["log", "-1", "--format=%B"], { cwd: repo, env, encoding: "utf8" });
      expect(message).toContain("via mise");
      expect(message).toContain("Co-Authored-By: TestBot <");
      expect(message).toContain("Generated-By: ");
    } finally {
      rmSync(repo, { recursive: true, force: true });
      await handlers.session_shutdown?.();
    }
  });
});

function hasMise(): boolean {
  try {
    execFileSync("mise", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
