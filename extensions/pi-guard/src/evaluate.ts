import {
  commandMatchesPattern,
  basenames,
  simpleCommandArgvs,
  stripWrappers,
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
    const argvs = simpleCommandArgvs(tokenizeShell(command));
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
          argvs,
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
    for (const script of embeddedScripts(argvs)) {
      const inner = evaluateGuard(
        { tool: "bash", command: script, cwd: input.cwd, home: input.home },
        policy,
      );
      if (inner.block) return inner;
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
 * Bash path guard: check each non-flag argv token as a concrete path against the rule.
 * Shell quote-splitting (e.g. "$HOME"/.ne"trc") collapses into one token,
 * and commit-message strings are not treated as file paths.
 */
function pathMatchesCommandArgv(
  argvs: string[][],
  ruleValue: string,
  cwd: string,
  home: string,
): boolean {
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

/**
 * Extract statically-visible inner scripts from shell wrappers:
 * `sh -c '<script>'`, `eval '<script>'`. Dynamic variable construction
 * (e.g. `tool=env; "$tool"`) cannot be resolved statically.
 */
function embeddedScripts(argvs: string[][]): string[] {
  const scripts: string[] = [];
  const shells = new Set(["sh", "bash", "dash", "zsh", "ash"]);
  for (const argv of argvs) {
    const stripped = stripWrappers(argv);
    if (stripped.length === 0) continue;
    const head = basenames(stripped[0]);
    if (shells.has(head)) {
      const cIdx = stripped.indexOf("-c");
      if (cIdx !== -1 && cIdx + 1 < stripped.length) {
        scripts.push(stripped[cIdx + 1]);
      }
      continue;
    }
    if (head === "eval") {
      for (let i = 1; i < stripped.length; i++) {
        if (stripped[i].startsWith("-")) continue;
        scripts.push(stripped.slice(i).join(" "));
        break;
      }
    }
  }
  return scripts;
}
