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

/** True when char continues a path after `/` (not shell delim / glob). */
function isPathSegmentStart(ch: string): boolean {
  if (ch === "*") return false;
  return !/[\s|;&<>()`'"\n\r]/.test(ch);
}

/**
 * Path-root false positive: pattern ends with `/` or `~` and the match is only
 * a prefix of a longer path (`rm -rf /` ⊄ `/tmp`, `find ~` ⊄ `~/Code`).
 */
function isLongerPathExtension(
  text: string,
  afterIdx: number,
  pattern: string,
): boolean {
  const after = text[afterIdx];
  if (after === undefined) return false;
  if (pattern.endsWith("~")) return after === "/";
  if (pattern.endsWith("/")) return isPathSegmentStart(after);
  return false;
}

/**
 * Command / needle match.
 * - with `*`: substring glob (`*` → any chars incl. `/`)
 * - no `*`: substring includes, except path-root patterns ending in `/` or `~`
 *   must not extend into a longer path target
 */
export function textMatchesPattern(text: string, pattern: string): boolean {
  if (pattern.includes("*")) {
    return new RegExp(globToRegExpSource(pattern)).test(text);
  }
  let from = 0;
  for (;;) {
    const idx = text.indexOf(pattern, from);
    if (idx === -1) return false;
    if (!isLongerPathExtension(text, idx + pattern.length, pattern)) {
      return true;
    }
    from = idx + 1;
  }
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
 * Protocol (every field prefixed):
 *   `! FORBIDDEN <HEADER>`
 *   `command: <value>` | `path: <value>`
 *   `reason: <detail>`   (optional)
 *
 * detail 优先级：
 * 1. 规则自己的 reason
 * 2. default_reason —— 仅非 builtin（global/project 用户规则）
 * 3. builtin 无 per-rule reason 时不加 reason 行（回退为仅展示 command|path）
 */
export function resolveBlockReason(
  rule: Rule,
  kind: "command" | "path",
  defaultReason?: string,
): string {
  // Leading `!` + uppercase header: tool-error surfaces often de-emphasize plain text.
  const ruleReason =
    rule.reason !== undefined && rule.reason !== ""
      ? oneLineBody(rule.reason)
      : undefined;
  const header =
    ruleReason !== undefined
      ? "BY USER"
      : kind === "command"
        ? "COMMAND"
        : "PATH";
  const targetKey = kind === "command" ? "command" : "path";
  const targetLine = `${targetKey}: ${rule.value}`;
  let detail = ruleReason;
  if (
    detail === undefined &&
    rule.source !== "builtin" &&
    defaultReason !== undefined &&
    defaultReason !== ""
  ) {
    detail = oneLineBody(defaultReason);
  }
  if (detail !== undefined) {
    return `! FORBIDDEN ${header}\n${targetLine}\nreason: ${detail}`;
  }
  return `! FORBIDDEN ${header}\n${targetLine}`;
}
