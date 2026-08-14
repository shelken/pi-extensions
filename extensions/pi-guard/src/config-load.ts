import { readFileSync } from "node:fs";
import path from "node:path";
import { buildPolicy, type BuildPolicyResult } from "./policy.ts";
import type { Policy } from "./evaluate.ts";

export type PermissionPaths = {
  globalPath: string;
  projectPath: string;
};

export type LoadFailure = {
  path: string;
  message: string;
};

export type LoadPolicyResult = {
  policy: Policy;
  failures: LoadFailure[];
};

export type ReadConfigResult =
  | { status: "missing" }
  | { status: "ok"; text: string }
  | { status: "error"; message: string };

/** Global + project permissions.yaml locations (settings-adjacent). */
export function getPermissionPaths(
  cwd: string,
  agentDir: string,
): PermissionPaths {
  return {
    globalPath: path.join(agentDir, "permissions.yaml"),
    projectPath: path.join(cwd, ".pi", "permissions.yaml"),
  };
}

export function readConfigFile(filePath: string): ReadConfigResult {
  try {
    return { status: "ok", text: readFileSync(filePath, "utf8") };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return { status: "missing" };
    }
    return {
      status: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

function sourceFromRead(
  filePath: string,
  read: ReadConfigResult,
  failures: LoadFailure[],
): string | null {
  if (read.status === "ok") return read.text;
  if (read.status === "error") {
    failures.push({ path: filePath, message: read.message });
  }
  return null;
}

/**
 * Load layers from disk (or inject reads for tests).
 * Missing files silent; IO/parse failures recorded and that layer empty.
 */
export function loadPolicyFromPaths(
  paths: PermissionPaths,
  readers?: {
    readGlobal?: () => ReadConfigResult;
    readProject?: () => ReadConfigResult;
  },
  expand?: { home?: string; cwd?: string },
): LoadPolicyResult {
  const failures: LoadFailure[] = [];
  const globalRead = readers?.readGlobal
    ? readers.readGlobal()
    : readConfigFile(paths.globalPath);
  const projectRead = readers?.readProject
    ? readers.readProject()
    : readConfigFile(paths.projectPath);

  const globalSource = sourceFromRead(paths.globalPath, globalRead, failures);
  const projectSource = sourceFromRead(paths.projectPath, projectRead, failures);

  const built: BuildPolicyResult = buildPolicy({
    globalSource,
    projectSource,
    home: expand?.home,
    cwd: expand?.cwd,
  });

  for (const err of built.errors) {
    if (err.startsWith("global:")) {
      failures.push({
        path: paths.globalPath,
        message: err.slice("global:".length).trim(),
      });
    } else if (err.startsWith("project:")) {
      failures.push({
        path: paths.projectPath,
        message: err.slice("project:".length).trim(),
      });
    } else {
      failures.push({ path: paths.globalPath, message: err });
    }
  }

  return { policy: built.policy, failures };
}

export function formatLoadFailure(failure: LoadFailure): string {
  return `pi-guard: failed to load ${failure.path}: ${failure.message}; layer ignored (fail-open)`;
}
