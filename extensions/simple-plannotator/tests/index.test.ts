import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import simplePlannotator from "../index.ts";

describe("simple-plannotator extension", () => {
  it("registers its annotation commands", () => {
    const commands: string[] = [];
    const pi = {
      registerCommand: vi.fn((command: string) => commands.push(command)),
    } as unknown as ExtensionAPI;

    simplePlannotator(pi);

    expect(commands).toEqual(["pnr", "pna", "pnl"]);
  });
});
