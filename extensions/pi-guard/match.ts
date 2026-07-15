import path from "node:path";
import type { Rule } from "./evaluate.ts";

/** Escape regex specials except `*` which becomes `.*`. */
export function globToRegExpSource(pattern: string): string {
  let out = "";
  for (const ch of pattern) {
    if (ch === "*") {
      out += ".*";
      continue;
    }
    if (/[\\^$+?.()|[\]{}]/.test(ch)) {
      out += `\\${ch}`;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Command / needle match: includes or substring glob (`*` any chars incl. `/`). */
export function textMatchesPattern(text: string, pattern: string): boolean {
  if (!pattern.includes("*")) {
    return text.includes(pattern);
  }
  return new RegExp(globToRegExpSource(pattern)).test(text);
}

/**
 * Expand only `~` and `~/...`. `~user` left unchanged.
 * HOME empty → leave `~` forms as-is.
 */
export function expandUser(p: string, home: string): string {
  if (p === "~") {
    return home || p;
  }
  if (p.startsWith("~/")) {
    if (!home) return p;
    return home + p.slice(1);
  }
  return p;
}

/**
 * Normalize a concrete path (no glob intent): ~, relative→cwd, normalize.
 * Does not realpath.
 */
export function normPath(p: string, cwd: string, home: string): string {
  const t = expandUser(p.trim(), home);
  return path.normalize(path.resolve(cwd, t));
}

/**
 * Absolute form of a rule path, preserving `*`.
 * Same ~ / relative / normalize rules as norm, without resolving globs away.
 */
export function absoluteForm(rule: string, cwd: string, home: string): string {
  const t = expandUser(rule.trim(), home);
  // path.resolve keeps `*` segments; normalize collapses . / ..
  return path.normalize(path.resolve(cwd, t));
}

/** Full-path match for read/write/edit candidates. */
export function pathRuleMatchesFull(
  candidate: string,
  ruleValue: string,
  cwd: string,
  home: string,
): boolean {
  const C = normPath(candidate, cwd, home);
  const R = absoluteForm(ruleValue, cwd, home);
  if (!R.includes("*")) {
    return C === R;
  }
  return new RegExp(`^${globToRegExpSource(R)}$`).test(C);
}

/** Bash command scan: original needle + absolute needle. */
export function pathRuleMatchesInCommand(
  command: string,
  ruleValue: string,
  cwd: string,
  home: string,
): boolean {
  const original = ruleValue.trim();
  const absolute = absoluteForm(ruleValue, cwd, home);
  if (textMatchesPattern(command, original)) return true;
  if (absolute !== original && textMatchesPattern(command, absolute)) return true;
  return false;
}

function oneLineBody(text: string): string {
  return text.split(/\r\n|\r|\n/).join(" ").trim();
}

/**
 * Agent-visible block reason.
 * Protocol: `! FORBIDDEN <HEADER>\n<body>` (headers uppercase for emphasis)
 * - per-rule reason → `BY USER`, body = user text
 * - default_reason only → `COMMAND`|`PATH`, body = default text
 * - builtin template → `COMMAND`|`PATH`, body = rule.value
 */
export function resolveBlockReason(
  rule: Rule,
  kind: "command" | "path",
  defaultReason?: string,
): string {
  // Leading `!` + uppercase header: tool-error surfaces often de-emphasize plain text.
  const kindHeader = kind === "command" ? "COMMAND" : "PATH";
  if (rule.reason !== undefined && rule.reason !== "") {
    return `! FORBIDDEN BY USER\n${oneLineBody(rule.reason)}`;
  }
  if (defaultReason !== undefined && defaultReason !== "") {
    return `! FORBIDDEN ${kindHeader}\n${oneLineBody(defaultReason)}`;
  }
  return `! FORBIDDEN ${kindHeader}\n${rule.value}`;
}
