import { parse as parseYaml } from "yaml";
import type { Policy, Rule } from "./evaluate.ts";

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
  { value: "~/.specific.zsh", source: "builtin" },
];

function isRemoveString(raw: string): string | null {
  const t = raw.trim();
  if (t.startsWith("-") && !t.startsWith("--") && t.length > 1) {
    return t.slice(1);
  }
  return null;
}

function nonEmptyString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

function parseListOps(
  list: unknown,
  valueKey: "pattern" | "path",
): { ops: LayerOp[]; skipped: number } {
  if (list == null) return { ops: [], skipped: 0 };
  if (!Array.isArray(list)) return { ops: [], skipped: 1 };

  const ops: LayerOp[] = [];
  let skipped = 0;

  for (const item of list) {
    if (typeof item === "string") {
      const remove = isRemoveString(item);
      if (remove !== null) {
        if (remove === "") {
          skipped++;
          continue;
        }
        ops.push({ type: "remove", value: remove });
        continue;
      }
      const value = item.trim();
      if (value === "") {
        skipped++;
        continue;
      }
      ops.push({ type: "add", value });
      continue;
    }

    if (item && typeof item === "object" && !Array.isArray(item)) {
      const rec = item as Record<string, unknown>;
      const value = nonEmptyString(rec[valueKey]);
      if (value === undefined) {
        skipped++;
        continue;
      }
      const reason = nonEmptyString(rec.reason);
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

  if (typeof doc !== "object" || Array.isArray(doc)) {
    return { ok: false, error: "root must be a mapping" };
  }

  const root = doc as Record<string, unknown>;
  const commands = parseListOps(root.deny_commands, "pattern");
  const paths = parseListOps(root.deny_paths, "path");

  const layer: ParsedLayer = {
    commandOps: commands.ops,
    pathOps: paths.ops,
    skipped: commands.skipped + paths.skipped,
  };

  const dr = root.default_reason;
  if (typeof dr === "string" && dr.trim() !== "") {
    layer.default_reason = dr;
  }

  return { ok: true, layer };
}

export function applyOps(rules: Rule[], ops: LayerOp[]): Rule[] {
  let out = rules.slice();
  for (const op of ops) {
    if (op.type === "remove") {
      out = out.filter((r) => r.value !== op.value);
      continue;
    }
    const next: Rule =
      op.reason === undefined
        ? { value: op.value, source: "user" }
        : { value: op.value, reason: op.reason, source: "user" };
    const i = out.findIndex((r) => r.value === op.value);
    if (i >= 0) out[i] = next;
    else out.push(next);
  }
  return out;
}

/**
 * Merge builtins → global → project.
 * Missing sources are empty layers. Bad YAML layers are skipped (fail-open).
 */
export function buildPolicy(input: {
  globalSource?: string | null;
  projectSource?: string | null;
}): BuildPolicyResult {
  const errors: string[] = [];
  let commands = BUILTIN_COMMANDS.slice();
  let paths = BUILTIN_PATHS.slice();
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
    commands = applyOps(commands, parsed.layer.commandOps);
    paths = applyOps(paths, parsed.layer.pathOps);
  }

  const policy: Policy =
    default_reason === undefined
      ? { commands, paths }
      : { default_reason, commands, paths };

  return { policy, errors };
}
