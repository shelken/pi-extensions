/**
 * pi-guard — hard-block dangerous agent bash and secret paths.
 *
 * Factory stays free of network and sync heavy IO; config load comes later.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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

export default function piGuard(_pi: ExtensionAPI): void {
  // hooks wired in a later ticket
}
