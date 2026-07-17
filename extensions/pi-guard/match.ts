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

/** Shell / phrase edge: EOF or separator — not path/token continuation. */
function isPhraseBoundary(ch: string | undefined): boolean {
  if (ch === undefined) return true;
  // `*`：命令里的 glob 字符，使 `rm -rf /` 能挡住 `rm -rf /*`，又不会像 includes 那样吃掉 `/tmp`
  return /[\s|;&<>(){}[\]`'"*\n\r]/.test(ch);
}

/**
 * Command / needle match.
 * - with `*`: 用户显式通配，子串 glob（`*` → 任意字符含 `/`）
 * - no `*`: 短语匹配——pattern 两侧须为边界（串首/尾或 shell 分隔符），
 *   禁止 `git add .` 命中 `git add .agents/...`、`find ~` 命中 `find ~/…`
 */
export function textMatchesPattern(text: string, pattern: string): boolean {
  if (pattern.includes("*")) {
    return new RegExp(globToRegExpSource(pattern)).test(text);
  }
  let from = 0;
  for (;;) {
    const idx = text.indexOf(pattern, from);
    if (idx === -1) return false;
    const before = idx === 0 ? undefined : text[idx - 1];
    const after = text[idx + pattern.length];
    if (isPhraseBoundary(before) && isPhraseBoundary(after)) {
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
 * Free-text home expand for rules and match inputs.
 * `${HOME}` / `$HOME` / `~` / `~/…` → absolute home; `~user` unchanged.
 * Empty home → no-op. Match stage always runs on this output.
 */
export function expandHomeInText(text: string, home: string): string {
  if (!home) return text;
  let s = text.replaceAll("${HOME}", home);
  s = s.replace(/\$HOME\b/g, home);
  // ~ or ~/…, not ~user (username continues with word chars)
  s = s.replace(
    /(^|[^A-Za-z0-9_])~(?=\/|$|[^A-Za-z0-9_/])/g,
    (_m, pre: string) => pre + home,
  );
  return s;
}

/**
 * Normalize a concrete path (no glob intent): home forms, relative→cwd, normalize.
 * Does not realpath.
 */
export function normPath(p: string, cwd: string, home: string): string {
  const t = expandHomeInText(p.trim(), home);
  return path.normalize(path.resolve(cwd, t));
}

/**
 * Absolute form of a rule path, preserving `*`.
 * Same home / relative / normalize rules as norm, without resolving globs away.
 */
export function absoluteForm(rule: string, cwd: string, home: string): string {
  const t = expandHomeInText(rule.trim(), home);
  // path.resolve keeps `*` segments; normalize collapses . / ..
  return path.normalize(path.resolve(cwd, t));
}

function stillHasHomeToken(s: string): boolean {
  return (
    /\$\{HOME\}/.test(s) ||
    /\$HOME\b/.test(s) ||
    /(^|[^A-Za-z0-9_])~(?=\/|$|[^A-Za-z0-9_/])/.test(s)
  );
}

/**
 * Materialize rule values at ingest: original + home-expanded
 * (+ path absolute form when home tokens are resolved). Match stage only
 * sees home-expanded inputs against these values.
 */
export function expandRuleValues(
  value: string,
  kind: "command" | "path",
  home: string,
  cwd: string,
): string[] {
  const out = new Set<string>();
  out.add(value);
  const expanded = expandHomeInText(value, home);
  out.add(expanded);
  if (kind === "path" && !stillHasHomeToken(expanded)) {
    // skip when ~ /$HOME unresolved — path.resolve would turn `~` into cwd junk
    out.add(absoluteForm(expanded, cwd, home));
  }
  return [...out];
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
