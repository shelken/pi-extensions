import {
  commandMatchesPattern,
  simpleCommandArgvs,
  tokenizeShell,
} from "./command-match.ts";
import {
  expandHomeInText,
  normPath,
  pathRuleMatchesFull,
  resolveBlockReason,
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
      if (commandMatchesPattern(command, rule.value)) {
        return {
          block: true,
          reason: resolveBlockReason(rule, "command", policy.default_reason),
        };
      }
    }
    for (const rule of policy.paths) {
      if (
        pathMatchesCommandArgv(
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

/**
 * Bash path guard: tokenize the command into argv tokens, then check each
 * non-flag token as a concrete path against the rule.
 * Shell quote-splitting (e.g. "$HOME"/.ne"trc") collapses into one token,
 * and commit-message strings are not treated as file paths.
 */
function pathMatchesCommandArgv(
  command: string,
  ruleValue: string,
  cwd: string,
  home: string,
): boolean {
  const argvs = simpleCommandArgvs(tokenizeShell(command));
  for (const argv of argvs) {
    for (const token of argv) {
      if (token.startsWith("-")) continue;
      if (token.includes("/")) {
        if (pathRuleMatchesFull(token, ruleValue, cwd, home)) return true;
      }
    }
  }
  return false;
}
