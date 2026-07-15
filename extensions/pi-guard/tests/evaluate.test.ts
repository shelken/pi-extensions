import { describe, expect, it } from "vitest";
import { evaluateGuard } from "../evaluate.ts";

describe("evaluateGuard", () => {
  it("allows any input in the empty-shell phase", () => {
    expect(
      evaluateGuard(
        {
          tool: "bash",
          command: "rm -rf /",
          cwd: "/tmp",
          home: "/home/me",
        },
        { commands: [], paths: [] },
      ),
    ).toEqual({ block: false });

    expect(
      evaluateGuard(
        {
          tool: "read",
          path: "~/.ssh/id_rsa",
          cwd: "/tmp",
          home: "/home/me",
        },
        { commands: [], paths: [] },
      ),
    ).toEqual({ block: false });
  });
});
