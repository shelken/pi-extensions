import {
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
  if (input.tool === "bash") {
    for (const rule of policy.commands) {
      if (textMatchesPattern(input.command, rule.value)) {
        return {
          block: true,
          reason: resolveBlockReason(rule, "command", policy.default_reason),
        };
      }
    }
    for (const rule of policy.paths) {
      if (
        pathRuleMatchesInCommand(
          input.command,
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

  const pathValue = input.path?.trim() ?? "";
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
