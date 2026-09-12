import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import autoModelPrompts, { loadConfig, getConfigPaths, findPrompt, getPromptDirs } from "../src/index.ts";

/** 测试进程所在宿主目录名与其兼容回退目录名 (与 src 的实现同源, 避免把 .pi/.omp 写死) */
const HOST = CONFIG_DIR_NAME || ".pi";
const LEGACY = HOST === ".pi" ? ".omp" : ".pi";

// 隔离开发机真实目录: 默认 homedir() 与 getAgentDir() 都不能落到真实 ~/.pi/.omp agent 目录
const originalHome = process.env.HOME;
const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
let envHome: string;
let envAgentDir: string;
beforeAll(() => {
  envHome = mkdtempSync(join(tmpdir(), "pi-amp-env-home-"));
  envAgentDir = mkdtempSync(join(tmpdir(), "pi-amp-env-agent-"));
  process.env.HOME = envHome;
  process.env.PI_CODING_AGENT_DIR = envAgentDir;
});
afterAll(() => {
  rmSync(envHome, { recursive: true, force: true });
  rmSync(envAgentDir, { recursive: true, force: true });
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
});

function asApi(stub: any): ExtensionAPI {
  // SAFETY: 测试桩只实现被测路径调用的方法，经单次断言收敛到 ExtensionAPI
  return stub as ExtensionAPI;
}

function withTempHome<T>(fn: (home: string, cwd: string) => T): T {
  const home = mkdtempSync(join(tmpdir(), "pi-amp-home-"));
  const cwd = mkdtempSync(join(tmpdir(), "pi-amp-cwd-"));
  try {
    return fn(home, cwd);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
}

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 把宿主 agent 目录 (getAgentDir 读 PI_CODING_AGENT_DIR) 临时指向 dir */
function withAgentDir<T>(dir: string, fn: () => T): T {
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
  }
}

describe("pi-auto-model-prompts extension", () => {
  it("registers the session and prompt events", () => {
    const events: string[] = [];
    const pi = asApi({
      on: vi.fn((event: string) => events.push(event)),
    });

    autoModelPrompts(pi);

    expect(events).toEqual(["session_start", "before_agent_start"]);
  });
});

describe("pi-auto-model-prompts config paths", () => {
  it("uses the other host's paths only when the active host has no config", () => {
    expect(getConfigPaths("/repo/app", "/home/me")).toEqual([
      join("/home/me", LEGACY, "agent", "extensions", "pi-auto-model-prompts", "config.json"),
      join("/repo/app", LEGACY, "extensions", "pi-auto-model-prompts", "config.json"),
    ]);
  });

  it("uses only the active host's paths once it has a config file", () =>
    withTempHome((home, cwd) => {
      const dir = join(cwd, HOST, "extensions", "pi-auto-model-prompts");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "config.json"), "{}");

      expect(getConfigPaths(cwd, home)).toEqual([
        join(home, HOST, "agent", "extensions", "pi-auto-model-prompts", "config.json"),
        join(cwd, HOST, "extensions", "pi-auto-model-prompts", "config.json"),
      ]);
    }));

  it("ignores the other host's config even when it disables the extension", () =>
    withTempHome((home, cwd) => {
      const hostDir = join(cwd, HOST, "extensions", "pi-auto-model-prompts");
      mkdirSync(hostDir, { recursive: true });
      writeFileSync(join(hostDir, "config.json"), JSON.stringify({ enabled: true }));

      const legacyDir = join(cwd, LEGACY, "extensions", "pi-auto-model-prompts");
      mkdirSync(legacyDir, { recursive: true });
      writeFileSync(join(legacyDir, "config.json"), JSON.stringify({ enabled: false }));

      expect(loadConfig(cwd, home).enabled).toBe(true);
    }));
});

describe("loadConfig", () => {
  it("returns defaults when no config file exists", () =>
    withTempHome((home, cwd) => {
      const cfg = loadConfig(cwd, home);
      expect(cfg.enabled).toBe(true);
      expect(cfg.liveReload).toBe(false);
    }));

  it("respects project-level liveReload override", () =>
    withTempHome((home, cwd) => {
      const dir = join(cwd, ".pi", "extensions", "pi-auto-model-prompts");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "config.json"), JSON.stringify({ liveReload: true, enabled: false }));

      const cfg = loadConfig(cwd, home);
      expect(cfg.liveReload).toBe(true);
      expect(cfg.enabled).toBe(false);
    }));

  it("global config is overridden by project-level config", () =>
    withTempHome((home, cwd) => {
      const gDir = join(home, ".pi", "agent", "extensions", "pi-auto-model-prompts");
      mkdirSync(gDir, { recursive: true });
      writeFileSync(join(gDir, "config.json"), JSON.stringify({ liveReload: true }));

      const pDir = join(cwd, ".pi", "extensions", "pi-auto-model-prompts");
      mkdirSync(pDir, { recursive: true });
      writeFileSync(join(pDir, "config.json"), JSON.stringify({ liveReload: false }));

      const cfg = loadConfig(cwd, home);
      expect(cfg.liveReload).toBe(false);
    }));
});

describe("findPrompt", () => {
  it("matches exact model id with highest priority", () =>
    withTempHome((home, cwd) => {
      writeFileSync(join(cwd, "AGENTS.gpt-5.5.md"), "exact content");
      writeFileSync(join(cwd, "AGENTS.gpt-*.md"), "prefix content");
      writeFileSync(join(cwd, "AGENTS.*.md"), "wildcard content");

      const dirs = getPromptDirs(cwd, home);
      expect(findPrompt("gpt-5.5", dirs)).toBe("exact content");
    }));

  it("falls back to prefix then wildcard", () =>
    withTempHome((home, cwd) => {
      writeFileSync(join(cwd, "AGENTS.gpt-*.md"), "prefix content");
      writeFileSync(join(cwd, "AGENTS.*.md"), "wildcard content");

      const dirs = getPromptDirs(cwd, home);
      expect(findPrompt("gpt-4o", dirs)).toBe("prefix content");
      expect(findPrompt("claude-sonnet", dirs)).toBe("wildcard content");
    }));

  it("matches only the part after the last slash", () =>
    withTempHome((home, cwd) => {
      writeFileSync(join(cwd, "AGENTS.fixture-alpha.md"), "exact content");
      writeFileSync(join(cwd, "AGENTS.namespace*.md"), "namespaced content");
      writeFileSync(join(cwd, "AGENTS.*.md"), "wildcard content");

      const dirs = getPromptDirs(cwd, home);
      expect(findPrompt("outer/namespace/fixture-alpha", dirs)).toBe("exact content");
      expect(findPrompt("namespace/fixture-beta", dirs)).toBe("wildcard content");
    }));

  it("matches text surrounded by wildcards", () =>
    withTempHome((home, cwd) => {
      writeFileSync(join(cwd, "AGENTS.*fixture-alpha*.md"), "contains content");
      writeFileSync(join(cwd, "AGENTS.*.md"), "wildcard content");

      const dirs = getPromptDirs(cwd, home);
      expect(findPrompt("namespace/my-fixture-alpha-preview", dirs)).toBe("contains content");
      expect(findPrompt("namespace/fixture-beta", dirs)).toBe("wildcard content");
    }));

  it("ignores empty files", () =>
    withTempHome((home, cwd) => {
      writeFileSync(join(cwd, "AGENTS.gpt-5.5.md"), "   ");
      writeFileSync(join(cwd, "AGENTS.*.md"), "fallback");

      const dirs = getPromptDirs(cwd, home);
      expect(findPrompt("gpt-5.5", dirs)).toBe("fallback");
    }));

  it("returns undefined when no match", () =>
    withTempHome((home, cwd) => {
      const dirs = getPromptDirs(cwd, home);
      expect(findPrompt("gpt-5.5", dirs)).toBeUndefined();
    }));

  it("prefers the project root over the host agent directory", () =>
    withTempHome((home, cwd) =>
      withTempDir("pi-amp-agent-", (agentDir) => {
        writeFileSync(join(cwd, "AGENTS.gpt-5.5.md"), "project content");
        writeFileSync(join(agentDir, "AGENTS.gpt-5.5.md"), "agent content");

        withAgentDir(agentDir, () => {
          expect(findPrompt("gpt-5.5", getPromptDirs(cwd, home))).toBe("project content");
        });
      })));

  it("prefers the host agent directory over the other host's agent directory", () =>
    withTempHome((home, cwd) =>
      withTempDir("pi-amp-agent-", (agentDir) => {
        writeFileSync(join(agentDir, "AGENTS.gpt-5.5.md"), "host agent content");
        const otherDir = join(home, LEGACY, "agent");
        mkdirSync(otherDir, { recursive: true });
        writeFileSync(join(otherDir, "AGENTS.gpt-5.5.md"), "other host agent content");

        withAgentDir(agentDir, () => {
          expect(findPrompt("gpt-5.5", getPromptDirs(cwd, home))).toBe("host agent content");

          rmSync(join(agentDir, "AGENTS.gpt-5.5.md"));
          expect(findPrompt("gpt-5.5", getPromptDirs(cwd, home))).toBe("other host agent content");
        });
      })));

  it("ignores a bare AGENTS.md and files that break the naming contract", () =>
    withTempHome((_home, cwd) => {
      writeFileSync(join(cwd, "AGENTS.md"), "project instructions");
      writeFileSync(join(cwd, "AGENTS..md"), "empty matcher");
      writeFileSync(join(cwd, "AGENTS.foo.txt"), "wrong extension");

      expect(findPrompt("anything", [cwd])).toBeUndefined();
      // 空 matcher 若被当成 exact, 空 basename 的模型 ID 会命中裸 AGENTS.md
      expect(findPrompt("provider/", [cwd])).toBeUndefined();
    }));

  it("skips a directory whose name looks like a prompt file", () =>
    withTempHome((_home, cwd) => {
      mkdirSync(join(cwd, "AGENTS.*.md"));
      writeFileSync(join(cwd, "AGENTS.gpt-5.5.md"), "exact content");

      expect(findPrompt("gpt-5.5", [cwd])).toBe("exact content");
      expect(findPrompt("unmatched-model", [cwd])).toBeUndefined();
    }));

  it("falls back to the host agent directory when the project file is empty", () =>
    withTempHome((home, cwd) =>
      withTempDir("pi-amp-agent-", (agentDir) => {
        writeFileSync(join(cwd, "AGENTS.gpt-5.5.md"), "   ");
        writeFileSync(join(agentDir, "AGENTS.gpt-5.5.md"), "agent content");

        withAgentDir(agentDir, () => {
          expect(findPrompt("gpt-5.5", getPromptDirs(cwd, home))).toBe("agent content");
        });
      })));
});

describe("before_agent_start systemPrompt handling", () => {
  it("appends prompt as string when event.systemPrompt is a string (Pi)", () =>
    withTempHome((_home, cwd) => {
      writeFileSync(join(cwd, "AGENTS.claude-3-7-sonnet.md"), "Special rules");

      const listeners: Record<string, Function> = {};
      const pi = asApi({
        on: vi.fn((event: string, handler: Function) => {
          listeners[event] = handler;
        }),
      });
      autoModelPrompts(pi);

      listeners.session_start({}, { cwd });
      const result = listeners.before_agent_start(
        { systemPrompt: "Base prompt" },
        { cwd, model: { id: "anthropic/claude-3-7-sonnet" } },
      );

      expect(result).toEqual({
        systemPrompt: "Base prompt\n\n# AUTO MODEL PROMPT(模型特别规则)\n\nSpecial rules",
      });
    }));

  it("appends prompt as array element when event.systemPrompt is string[] (OMP)", () =>
    withTempHome((_home, cwd) => {
      writeFileSync(join(cwd, "AGENTS.claude-3-7-sonnet.md"), "Special rules");

      const listeners: Record<string, Function> = {};
      const pi = asApi({
        on: vi.fn((event: string, handler: Function) => {
          listeners[event] = handler;
        }),
      });
      autoModelPrompts(pi);

      listeners.session_start({}, { cwd });
      const result = listeners.before_agent_start(
        { systemPrompt: ["Base prompt 1", "Base prompt 2"] },
        { cwd, model: { id: "anthropic/claude-3-7-sonnet" } },
      );

      expect(result).toEqual({
        systemPrompt: [
          "Base prompt 1",
          "Base prompt 2",
          "# AUTO MODEL PROMPT(模型特别规则)\n\nSpecial rules",
        ],
      });
    }));
});
