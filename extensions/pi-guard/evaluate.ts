/** Guard policy and evaluation seam (v1 rules land in later tickets). */

export type Rule = {
  value: string;
  reason?: string;
};

export type Policy = {
  default_reason?: string;
  commands: Rule[];
  paths: Rule[];
};

export type GuardInput =
  | { tool: "bash"; command: string; cwd: string; home: string }
  | {
      tool: "read" | "write" | "edit";
      path: string;
      cwd: string;
      home: string;
    };

export type GuardResult =
  | { block: false }
  | { block: true; reason: string };

/** Always allow until command/path matchers are implemented. */
export function evaluateGuard(_input: GuardInput, _policy: Policy): GuardResult {
  return { block: false };
}
