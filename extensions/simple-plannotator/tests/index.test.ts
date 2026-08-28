import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import simplePlannotator from "../src/index.ts";

function asApi(stub: any): ExtensionAPI {
  // SAFETY: 测试桩只实现被测路径调用的方法，经单次断言收敛到 ExtensionAPI
  return stub as ExtensionAPI;
}

describe("simple-plannotator extension", () => {
  it("registers its annotation commands", () => {
    const commands: string[] = [];
    const pi = asApi({
      registerCommand: vi.fn((command: string) => commands.push(command)),
    });

    simplePlannotator(pi);

    expect(commands).toEqual(["pnr", "pna", "pnl"]);
  });
});
