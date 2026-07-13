import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import coAuthoredBy from "../index.ts";

describe("pi-co-authored-by extension", () => {
  it("registers its lifecycle and bash hooks", () => {
    const events: string[] = [];
    const pi = {
      on: vi.fn((event: string) => events.push(event)),
    } as unknown as ExtensionAPI;

    coAuthoredBy(pi);

    expect(events).toEqual(["session_start", "session_shutdown", "tool_call"]);
  });
});
