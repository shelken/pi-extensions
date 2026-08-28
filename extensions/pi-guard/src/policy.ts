import { parse as parseYaml } from "yaml";
import type { Policy, Rule } from "./evaluate.ts";
import { expandRuleValues } from "./match.ts";

export type LayerOp =
  | { type: "add"; value: string; reason?: string }
  | { type: "remove"; value: string };

export type ParsedLayer = {
  default_reason?: string;
  commandOps: LayerOp[];
  pathOps: LayerOp[];
  skipped: number;
};

export type ParseLayerResult =
  | { ok: true; layer: ParsedLayer }
  | { ok: false; error: string };

export type BuildPolicyResult = {
  policy: Policy;
  errors: string[];
};

/** Frozen builtin deny commands (see docs/wayfinder builtin denylist). */
export const BUILTIN_COMMANDS: Rule[] = [
  { value: "rm -rf /", source: "builtin" },
  { value: "rm -rf ~", source: "builtin" },
  { value: "find /", source: "builtin" },
  { value: "find ~", source: "builtin" },
  { value: "env", source: "builtin" },
  { value: "printenv", source: "builtin" },
  { value: "export -p", source: "builtin" },
  { value: "curl *| bash", source: "builtin" },
  { value: "curl *|bash", source: "builtin" },
  { value: "wget *| sh", source: "builtin" },
  { value: "wget *|sh", source: "builtin" },
];

/** Frozen builtin deny paths. */
export const BUILTIN_PATHS: Rule[] = [
  { value: "~/.ssh/*", source: "builtin" },
  { value: "~/.aws/*", source: "builtin" },
  { value: "~/.gnupg/*", source: "builtin" },
  { value: "~/.netrc", source: "builtin" },
  { value: "~/.pypirc", source: "builtin" },
  { value: "~/.config/gh/hosts.yml", source: "builtin" },
  { value: "~/.config/hub", source: "builtin" },
  {
    value: "~/.config/gcloud/application_default_credentials.json",
    source: "builtin",
  },
  { value: "~/.config/doctl/config.yaml", source: "builtin" },
  { value: "~/.kube/config", source: "builtin" },
  { value: "~/.docker/config.json", source: "builtin" },
  { value: "~/.azure/accessTokens.json", source: "builtin" },
  { value: "~/.bash_history", source: "builtin" },
  { value: "~/.zsh_history", source: "builtin" },
];

function isRemoveString(raw: string): string | null {
  const t = raw.trim();
  if (t.startsWith("-") && !t.startsWith("--") && t.length > 1) {
    return t.slice(1);
  }
  return null;
}

function isNonEmptyString(v: any): v is string {
  return typeof v === "string" && v.trim() !== "";
}

type ListOpsResult = { ops: LayerOp[]; skipped: number };

// list 来自 YAML 文档（边界输入），参数从宽，逐项经 isNonEmptyString / isRemoveString 解析
function parseListOps(
  list: any,
  valueKey: "pattern" | "path",
): ListOpsResult {
  if (list == null) return { ops: [], skipped: 0 };
  if (!Array.isArray(list)) return { ops: [], skipped: 1 };

  const ops: LayerOp[] = [];
  let skipped = 0;

  for (const item of list) {
    if (isNonEmptyString(item)) {
      const remove = isRemoveString(item);
      if (remove !== null) {
        ops.push({ type: "remove", value: remove });
        continue;
      }
      ops.push({ type: "add", value: item.trim() });
      continue;
    }

    if (item && !Array.isArray(item)) {
      const value = isNonEmptyString(item[valueKey]) ? item[valueKey] : undefined;
      if (value === undefined) {
        skipped++;
        continue;
      }
      const reason = isNonEmptyString(item.reason) ? item.reason : undefined;
      ops.push(
        reason === undefined
          ? { type: "add", value }
          : { type: "add", value, reason },
      );
      continue;
    }

    skipped++;
  }

  return { ops, skipped };
}

/** Parse one permissions.yaml document into layer ops. */
export function parseLayerYaml(source: string): ParseLayerResult {
  let doc: unknown;
  try {
    doc = parseYaml(source);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  if (doc == null) {
    return {
      ok: true,
      layer: { commandOps: [], pathOps: [], skipped: 0 },
    };
  }

  if (!(doc instanceof Object) || Array.isArray(doc)) {
    return { ok: false, error: "root must be a mapping" };
  }

  // SAFETY: doc 已确认是 YAML 映射（排除 null/数组）；字段访问各自走 isNonEmptyString / parseListOps 解析
  const root = doc as any;
  const commands = parseListOps(root.deny_commands, "pattern");
  const paths = parseListOps(root.deny_paths, "path");

  const layer: ParsedLayer = {
    commandOps: commands.ops,
    pathOps: paths.ops,
    skipped: commands.skipped + paths.skipped,
  };

  const dr = root.default_reason;
  if (isNonEmptyString(dr)) {
    layer.default_reason = dr;
  }

  return { ok: true, layer };
}

export type ExpandCtx = { home: string; cwd: string };

function materializeRules(
  rules: Rule[],
  kind: "command" | "path",
  ctx: ExpandCtx,
): Rule[] {
  const out: Rule[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    for (const value of expandRuleValues(
      rule.value,
      kind,
      ctx.home,
      ctx.cwd,
    )) {
      if (seen.has(value)) continue;
      seen.add(value);
      out.push(
        rule.reason === undefined
          ? { value, source: rule.source }
          : { value, reason: rule.reason, source: rule.source },
      );
    }
  }
  return out;
}

export function applyOps(
  rules: Rule[],
  ops: LayerOp[],
  kind: "command" | "path",
  ctx: ExpandCtx,
): Rule[] {
  let out = rules.slice();
  for (const op of ops) {
    if (op.type === "remove") {
      const drop = new Set(
        expandRuleValues(op.value, kind, ctx.home, ctx.cwd),
      );
      out = out.filter((r) => !drop.has(r.value));
      continue;
    }
    for (const value of expandRuleValues(
      op.value,
      kind,
      ctx.home,
      ctx.cwd,
    )) {
      const next: Rule =
        op.reason === undefined
          ? { value, source: "user" }
          : { value, reason: op.reason, source: "user" };
      const i = out.findIndex((r) => r.value === value);
      if (i >= 0) out[i] = next;
      else out.push(next);
    }
  }
  return out;
}

/**
 * Merge builtins → global → project.
 * On ingest, home forms (`~` / `$HOME`) expand into absolute sibling rules.
 * Missing sources are empty layers. Bad YAML layers are skipped (fail-open).
 */
export function buildPolicy(input: {
  globalSource?: string | null;
  projectSource?: string | null;
  home?: string;
  cwd?: string;
}): BuildPolicyResult {
  const errors: string[] = [];
  const ctx: ExpandCtx = {
    home: input.home ?? "",
    cwd: input.cwd ?? ".",
  };
  let commands = materializeRules(BUILTIN_COMMANDS, "command", ctx);
  let paths = materializeRules(BUILTIN_PATHS, "path", ctx);
  let default_reason: string | undefined;

  const layers: Array<{ name: string; source: string | null | undefined }> = [
    { name: "global", source: input.globalSource },
    { name: "project", source: input.projectSource },
  ];

  for (const { name, source } of layers) {
    if (source == null) continue;

    const parsed = parseLayerYaml(source);
    if (!parsed.ok) {
      errors.push(`${name}: ${parsed.error}`);
      continue;
    }

    if (parsed.layer.default_reason !== undefined) {
      default_reason = parsed.layer.default_reason;
    }
    commands = applyOps(commands, parsed.layer.commandOps, "command", ctx);
    paths = applyOps(paths, parsed.layer.pathOps, "path", ctx);
  }

  const policy: Policy =
    default_reason === undefined
      ? { commands, paths }
      : { default_reason, commands, paths };

  return { policy, errors };
}
