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
});
