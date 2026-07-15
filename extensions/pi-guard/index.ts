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

export {
  absoluteForm,
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
    const loaded = loadPolicyFromPaths(paths);
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

    if (
      isToolCallEventType("read", event) ||
      isToolCallEventType("write", event) ||
      isToolCallEventType("edit", event)
    ) {
      const tool = event.toolName as "read" | "write" | "edit";
      const result = evaluateGuard(
        {
          tool,
          path: event.input.path ?? "",
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
