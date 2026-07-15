import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatLoadFailure,
  getPermissionPaths,
  loadPolicyFromPaths,
} from "../config-load.ts";

describe("getPermissionPaths", () => {
  it("uses agent dir + project .pi", () => {
    expect(getPermissionPaths("/repo", "/home/me/.pi/agent")).toEqual({
      globalPath: path.join("/home/me/.pi/agent", "permissions.yaml"),
      projectPath: path.join("/repo", ".pi", "permissions.yaml"),
    });
  });
});

describe("loadPolicyFromPaths", () => {
  it("missing files stay silent and keep builtins", () => {
    const root = mkdtempSync(path.join(tmpdir(), "pi-guard-"));
    const agentDir = path.join(root, "agent");
    mkdirSync(agentDir);
    const paths = getPermissionPaths(path.join(root, "proj"), agentDir);
    const { policy, failures } = loadPolicyFromPaths(paths);
    expect(failures).toEqual([]);
    expect(policy.commands.some((r) => r.value === "rm -rf /")).toBe(true);
  });

  it("loads project yaml over builtins", () => {
    const root = mkdtempSync(path.join(tmpdir(), "pi-guard-"));
    const agentDir = path.join(root, "agent");
    const proj = path.join(root, "proj");
    mkdirSync(agentDir);
    mkdirSync(path.join(proj, ".pi"), { recursive: true });
    writeFileSync(
      path.join(proj, ".pi", "permissions.yaml"),
      `
deny_commands:
  - "npm publish"
deny_paths:
  - ".env"
`,
      "utf8",
    );
    const paths = getPermissionPaths(proj, agentDir);
    const { policy, failures } = loadPolicyFromPaths(paths);
    expect(failures).toEqual([]);
    expect(policy.commands.some((r) => r.value === "npm publish")).toBe(true);
    expect(policy.paths.some((r) => r.value === ".env")).toBe(true);
  });

  it("records parse failure for bad layer without dropping builtins", () => {
    const paths = {
      globalPath: "/virtual/global/permissions.yaml",
      projectPath: "/virtual/project/.pi/permissions.yaml",
    };
    const { policy, failures } = loadPolicyFromPaths(paths, {
      readGlobal: () => ({ status: "ok", text: "deny_commands: [" }),
      readProject: () => ({ status: "missing" }),
    });
    expect(failures.length).toBe(1);
    expect(failures[0].path).toBe(paths.globalPath);
    expect(policy.commands.some((r) => r.value === "rm -rf /")).toBe(true);
    expect(formatLoadFailure(failures[0])).toContain("fail-open");
  });

  it("records IO errors (non-ENOENT) as failures", () => {
    const paths = {
      globalPath: "/virtual/global/permissions.yaml",
      projectPath: "/virtual/project/.pi/permissions.yaml",
    };
    const { failures } = loadPolicyFromPaths(paths, {
      readGlobal: () => ({ status: "error", message: "EACCES" }),
      readProject: () => ({ status: "missing" }),
    });
    expect(failures).toEqual([
      { path: paths.globalPath, message: "EACCES" },
    ]);
  });
});
