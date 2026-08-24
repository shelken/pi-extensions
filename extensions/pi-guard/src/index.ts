/**
 * pi-guard — hard-block dangerous agent bash and secret paths.
 *
 * Factory stays free of network and sync heavy IO; config loads on session_start
 * (or first tool_call if session_start was skipped).
 */

import { homedir } from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import {
  formatLoadFailure,
  getPermissionPaths,
  loadPolicyFromPaths,
  type LoadFailure,
} from "./config-load.ts";
import { evaluateGuard, type Policy } from "./evaluate.ts";

export {
  evaluateGuard,
  type GuardInput,
  type GuardResult,
  type Policy,
  type Rule,
} from "./evaluate.ts";

export {
  BUILTIN_COMMANDS,
  BUILTIN_PATHS,
  applyOps,
  buildPolicy,
  parseLayerYaml,
  type BuildPolicyResult,
  type LayerOp,
  type ParsedLayer,
  type ParseLayerResult,
} from "./policy.ts";

export { commandMatchesPattern } from "./command-match.ts";

export {
  absoluteForm,
  expandHomeInText,
  expandRuleValues,
  normPath,
  pathRuleMatchesFull,
  pathRuleMatchesInCommand,
  resolveBlockReason,
  textMatchesPattern,
} from "./match.ts";

export {
  formatLoadFailure,
  getPermissionPaths,
  loadPolicyFromPaths,
  readConfigFile,
  type LoadFailure,
  type LoadPolicyResult,
  type PermissionPaths,
  type ReadConfigResult,
} from "./config-load.ts";

type NotifyCtx = Pick<ExtensionContext, "cwd" | "hasUI" | "ui">;

export default function piGuard(pi: ExtensionAPI): void {
  let policy: Policy | null = null;
  const notifiedPaths = new Set<string>();

  function reportFailures(ctx: NotifyCtx, failures: LoadFailure[]): void {
    for (const failure of failures) {
      const msg = formatLoadFailure(failure);
      console.error(msg);
      if (notifiedPaths.has(failure.path)) continue;
      notifiedPaths.add(failure.path);
      if (ctx.hasUI) {
        ctx.ui.notify(msg, "error");
      }
    }
  }

  function ensurePolicy(ctx: NotifyCtx): Policy {
    if (policy) return policy;
    const paths = getPermissionPaths(ctx.cwd, getAgentDir());
    const loaded = loadPolicyFromPaths(paths, undefined, {
      home: homedir(),
      cwd: ctx.cwd,
    });
    policy = loaded.policy;
    reportFailures(ctx, loaded.failures);
    return policy;
  }

  function resetLoadState(): void {
    policy = null;
    notifiedPaths.clear();
  }

  pi.on("session_start", (_event, ctx) => {
    resetLoadState();
    ensurePolicy(ctx);
  });

  pi.on("tool_call", async (event, ctx) => {
    const active = ensurePolicy(ctx);
    const cwd = ctx.cwd;
    const home = homedir();

    if (isToolCallEventType("bash", event)) {
      const result = evaluateGuard(
        {
          tool: "bash",
          command: event.input.command ?? "",
          cwd,
          home,
        },
        active,
      );
      if (result.block) {
        return { block: true, reason: result.reason };
      }
      return;
    }

    // Any tool carrying a `path` field gets the same path guard as read/write/edit.
    // Covers built-in grep/find/ls/read/write/edit and custom tools following the same convention.
    const candidatePath = event.input.path;
    if (typeof candidatePath === "string" && candidatePath.trim() !== "") {
      const tool =
        event.toolName === "write" || event.toolName === "edit"
          ? event.toolName
          : "read";
      const result = evaluateGuard(
        {
          tool,
          path: candidatePath,
          cwd,
          home,
        },
        active,
      );
      if (result.block) {
        return { block: true, reason: result.reason };
      }
    }
  });
}
