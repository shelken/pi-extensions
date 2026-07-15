import { describe, expect, it } from "vitest";
import {
  BUILTIN_COMMANDS,
  BUILTIN_PATHS,
  buildPolicy,
  parseLayerYaml,
} from "../policy.ts";

describe("parseLayerYaml", () => {
  it("parses string and object items", () => {
    const r = parseLayerYaml(`
default_reason: "custom"
deny_commands:
  - "npm publish"
  - pattern: "git push -f"
    reason: "no force push"
deny_paths:
  - "~/.netrc"
  - path: ".env"
    reason: "env"
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layer.default_reason).toBe("custom");
    expect(r.layer.commandOps).toEqual([
      { type: "add", value: "npm publish" },
      { type: "add", value: "git push -f", reason: "no force push" },
    ]);
    expect(r.layer.pathOps).toEqual([
      { type: "add", value: "~/.netrc" },
      { type: "add", value: ".env", reason: "env" },
    ]);
  });

  it("parses remove ops for string minus (not --)", () => {
    const r = parseLayerYaml(`
deny_commands:
  - "-find ~"
  - "--flag"
deny_paths:
  - "-~/.ssh/*"
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layer.commandOps).toEqual([
      { type: "remove", value: "find ~" },
      { type: "add", value: "--flag" },
    ]);
    expect(r.layer.pathOps).toEqual([
      { type: "remove", value: "~/.ssh/*" },
    ]);
  });

  it("fails on invalid yaml", () => {
    const r = parseLayerYaml("deny_commands: [");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.length).toBeGreaterThan(0);
  });

  it("skips invalid list items", () => {
    const r = parseLayerYaml(`
deny_commands:
  - ""
  - 42
  - pattern: ""
  - "ok"
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layer.commandOps).toEqual([{ type: "add", value: "ok" }]);
    expect(r.layer.skipped).toBeGreaterThan(0);
  });
});

describe("buildPolicy", () => {
  it("starts from builtins when layers missing", () => {
    const { policy, errors } = buildPolicy({});
    expect(errors).toEqual([]);
    expect(policy.commands).toEqual(BUILTIN_COMMANDS);
    expect(policy.paths).toEqual(BUILTIN_PATHS);
    expect(policy.default_reason).toBeUndefined();
  });

  it("merges builtins → global → project with upsert and remove", () => {
    const { policy } = buildPolicy({
      globalSource: `
default_reason: "from global"
deny_commands:
  - pattern: "npm publish"
    reason: "global npm"
  - "git push -f"
deny_paths:
  - path: "~/.netrc"
    reason: "netrc"
`,
      projectSource: `
default_reason: "from project"
deny_commands:
  - "-find ~"
  - pattern: "npm publish"
    reason: "project npm"
deny_paths:
  - "-~/.specific.zsh"
  - ".env"
`,
    });

    expect(policy.default_reason).toBe("from project");

    const cmd = Object.fromEntries(policy.commands.map((r) => [r.value, r.reason]));
    expect(cmd["find ~"]).toBeUndefined();
    expect(cmd["npm publish"]).toBe("project npm");
    expect(cmd["git push -f"]).toBeUndefined(); // string add, no reason
    expect(policy.commands.some((r) => r.value === "git push -f")).toBe(true);
    expect(policy.commands.some((r) => r.value === "rm -rf /")).toBe(true);

    const paths = Object.fromEntries(policy.paths.map((r) => [r.value, r.reason]));
    expect(paths["~/.specific.zsh"]).toBeUndefined();
    expect(paths["~/.netrc"]).toBe("netrc");
    expect(policy.paths.some((r) => r.value === ".env")).toBe(true);
    expect(policy.paths.some((r) => r.value === "~/.ssh/*")).toBe(true);
  });

  it("ignores a bad layer without polluting others", () => {
    const { policy, errors } = buildPolicy({
      globalSource: "deny_commands: [",
      projectSource: `
deny_commands:
  - "npm publish"
`,
    });
    expect(errors.length).toBe(1);
    expect(policy.commands.some((r) => r.value === "npm publish")).toBe(true);
    expect(policy.commands.some((r) => r.value === "rm -rf /")).toBe(true);
  });

  it("treats empty default_reason as unset", () => {
    const { policy } = buildPolicy({
      globalSource: `default_reason: "keep"`,
      projectSource: `default_reason: ""`,
    });
    expect(policy.default_reason).toBe("keep");
  });
});
