import {
  expandHomeInText,
  pathRuleMatchesFull,
  pathRuleMatchesInCommand,
  resolveBlockReason,
  textMatchesPattern,
} from "./match.ts";

export type Rule = {
  value: string;
  reason?: string;
  /** builtin 不吃 default_reason；用户层 add/upsert 为 user */
  source?: "builtin" | "user";
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

export function evaluateGuard(input: GuardInput, policy: Policy): GuardResult {
  // Match stage only sees home-expanded text (`~` / `$HOME` → absolute).
  if (input.tool === "bash") {
    const command = expandHomeInText(input.command, input.home);
    for (const rule of policy.commands) {
      if (textMatchesPattern(command, rule.value)) {
        return {
          block: true,
          reason: resolveBlockReason(rule, "command", policy.default_reason),
        };
      }
    }
    for (const rule of policy.paths) {
      if (
        pathRuleMatchesInCommand(
          command,
          rule.value,
          input.cwd,
          input.home,
        )
      ) {
        return {
          block: true,
          reason: resolveBlockReason(rule, "path", policy.default_reason),
        };
      }
    }
    return { block: false };
  }

  const pathValue = expandHomeInText(input.path?.trim() ?? "", input.home);
  if (pathValue === "") {
    return { block: false };
  }

  for (const rule of policy.paths) {
    if (pathRuleMatchesFull(pathValue, rule.value, input.cwd, input.home)) {
      return {
        block: true,
        reason: resolveBlockReason(rule, "path", policy.default_reason),
      };
    }
  }
  return { block: false };
}
