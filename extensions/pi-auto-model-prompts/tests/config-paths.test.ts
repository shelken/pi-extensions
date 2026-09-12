import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import autoModelPrompts, { loadConfig, getConfigPaths, findPrompt, getPromptDirs } from "../src/index.ts";

const EXTENSION_NAME = "pi-auto-model-prompts";

// 隔离开发机真实目录: 默认 homedir() 不能落到真实 ~/.agents
const originalHome = process.env.HOME;
let envHome: string;
beforeAll(() => {
  envHome = mkdtempSync(join(tmpdir(), "pi-amp-env-home-"));
  process.env.HOME = envHome;
});
afterAll(() => {
  rmSync(envHome, { recursive: true, force: true });
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
});

function asApi(stub: { on: unknown }): ExtensionAPI {
  // SAFETY: 测试桩只实现被测路径调用的方法，经单次断言收敛到 ExtensionAPI
  return stub as unknown as ExtensionAPI;
}

function withTempHome<T>(fn: (home: string, cwd: string) => T): T {
  const home = mkdtempSync(join(tmpdir(), "pi-amp-home-"));
  const cwd = mkdtempSync(join(tmpdir(), "pi-amp-cwd-"));
  mkdirSync(join(home, ".agents"), { recursive: true });
  mkdirSync(join(cwd, ".agents"), { recursive: true });
  try {
    return fn(home, cwd);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
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
  it("reads global config first and project config second", () => {
    expect(getConfigPaths("/repo/app", "/home/me")).toEqual([
      join("/home/me", ".agents", EXTENSION_NAME, "config.json"),
      join("/repo/app", ".agents", EXTENSION_NAME, "config.json"),
    ]);
  });
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
      const dir = join(cwd, ".agents", EXTENSION_NAME);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "config.json"), JSON.stringify({ liveReload: true, enabled: false }));

      const cfg = loadConfig(cwd, home);
      expect(cfg.liveReload).toBe(true);
      expect(cfg.enabled).toBe(false);
    }));

  it("global config is overridden by project-level config", () =>
    withTempHome((home, cwd) => {
      const gDir = join(home, ".agents", EXTENSION_NAME);
      mkdirSync(gDir, { recursive: true });
      writeFileSync(join(gDir, "config.json"), JSON.stringify({ liveReload: true }));

      const pDir = join(cwd, ".agents", EXTENSION_NAME);
      mkdirSync(pDir, { recursive: true });
      writeFileSync(join(pDir, "config.json"), JSON.stringify({ liveReload: false }));

      const cfg = loadConfig(cwd, home);
      expect(cfg.liveReload).toBe(false);
    }));
});

describe("findPrompt", () => {
  it("matches exact model id with highest priority", () =>
    withTempHome((home, cwd) => {
      writeFileSync(join(cwd, ".agents", "AGENTS.gpt-5.5.md"), "exact content");
      writeFileSync(join(cwd, ".agents", "AGENTS.gpt-*.md"), "prefix content");
      writeFileSync(join(cwd, ".agents", "AGENTS.*.md"), "wildcard content");

      const dirs = getPromptDirs(cwd, home);
      expect(findPrompt("gpt-5.5", dirs)).toBe("exact content");
    }));

  it("falls back to prefix then wildcard", () =>
    withTempHome((home, cwd) => {
      writeFileSync(join(cwd, ".agents", "AGENTS.gpt-*.md"), "prefix content");
      writeFileSync(join(cwd, ".agents", "AGENTS.*.md"), "wildcard content");

      const dirs = getPromptDirs(cwd, home);
      expect(findPrompt("gpt-4o", dirs)).toBe("prefix content");
      expect(findPrompt("claude-sonnet", dirs)).toBe("wildcard content");
    }));

  it("matches only the part after the last slash", () =>
    withTempHome((home, cwd) => {
      writeFileSync(join(cwd, ".agents", "AGENTS.fixture-alpha.md"), "exact content");
      writeFileSync(join(cwd, ".agents", "AGENTS.namespace*.md"), "namespaced content");
      writeFileSync(join(cwd, ".agents", "AGENTS.*.md"), "wildcard content");

      const dirs = getPromptDirs(cwd, home);
      expect(findPrompt("outer/namespace/fixture-alpha", dirs)).toBe("exact content");
      expect(findPrompt("namespace/fixture-beta", dirs)).toBe("wildcard content");
    }));

  it("matches text surrounded by wildcards", () =>
    withTempHome((home, cwd) => {
      writeFileSync(join(cwd, ".agents", "AGENTS.*fixture-alpha*.md"), "contains content");
      writeFileSync(join(cwd, ".agents", "AGENTS.*.md"), "wildcard content");

      const dirs = getPromptDirs(cwd, home);
      expect(findPrompt("namespace/my-fixture-alpha-preview", dirs)).toBe("contains content");
      expect(findPrompt("namespace/fixture-beta", dirs)).toBe("wildcard content");
    }));

  it("ignores empty files", () =>
    withTempHome((home, cwd) => {
      writeFileSync(join(cwd, ".agents", "AGENTS.gpt-5.5.md"), "   ");
      writeFileSync(join(cwd, ".agents", "AGENTS.*.md"), "fallback");

      const dirs = getPromptDirs(cwd, home);
      expect(findPrompt("gpt-5.5", dirs)).toBe("fallback");
    }));

  it("returns undefined when no match", () =>
    withTempHome((home, cwd) => {
      const dirs = getPromptDirs(cwd, home);
      expect(findPrompt("gpt-5.5", dirs)).toBeUndefined();
    }));

  it("prefers the project .agents directory over the global one", () =>
    withTempHome((home, cwd) => {
      writeFileSync(join(cwd, ".agents", "AGENTS.gpt-5.5.md"), "project content");
      writeFileSync(join(home, ".agents", "AGENTS.gpt-5.5.md"), "global content");

      expect(findPrompt("gpt-5.5", getPromptDirs(cwd, home))).toBe("project content");
    }));

  it("falls back to the global .agents directory when the project file is empty", () =>
    withTempHome((home, cwd) => {
      writeFileSync(join(cwd, ".agents", "AGENTS.gpt-5.5.md"), "   ");
      writeFileSync(join(home, ".agents", "AGENTS.gpt-5.5.md"), "global content");

      expect(findPrompt("gpt-5.5", getPromptDirs(cwd, home))).toBe("global content");
    }));

  it("accepts a lowercase AGENTS prefix", () =>
    withTempHome((_home, cwd) => {
      writeFileSync(join(cwd, ".agents", "agents.gpt-5.5.md"), "lowercase prefix content");

      expect(findPrompt("gpt-5.5", [join(cwd, ".agents")])).toBe("lowercase prefix content");
    }));

  it("ignores a bare AGENTS.md and files that break the naming contract", () =>
    withTempHome((_home, cwd) => {
      const dirs = [join(cwd, ".agents")];
      writeFileSync(join(cwd, ".agents", "AGENTS.md"), "project instructions");
      writeFileSync(join(cwd, ".agents", "AGENTS..md"), "empty matcher");
      writeFileSync(join(cwd, ".agents", "AGENTS.foo.txt"), "wrong extension");

      expect(findPrompt("anything", dirs)).toBeUndefined();
      // 空 matcher 若被当成 exact, 空 basename 的模型 ID 会命中裸 AGENTS.md
      expect(findPrompt("provider/", dirs)).toBeUndefined();
    }));

  it("skips a directory whose name looks like a prompt file", () =>
    withTempHome((_home, cwd) => {
      const dirs = [join(cwd, ".agents")];
      mkdirSync(join(cwd, ".agents", "AGENTS.*.md"));
      writeFileSync(join(cwd, ".agents", "AGENTS.gpt-5.5.md"), "exact content");

      expect(findPrompt("gpt-5.5", dirs)).toBe("exact content");
      expect(findPrompt("unmatched-model", dirs)).toBeUndefined();
    }));

  it("falls through to the next candidate when a prompt file is unreadable", () =>
    withTempHome((_home, cwd) => {
      const exact = join(cwd, ".agents", "AGENTS.gpt-5.5.md");
      writeFileSync(exact, "exact content");
      writeFileSync(join(cwd, ".agents", "AGENTS.*.md"), "wildcard content");
      chmodSync(exact, 0o000);

      try {
        expect(findPrompt("gpt-5.5", [join(cwd, ".agents")])).toBe("wildcard content");
      } finally {
        chmodSync(exact, 0o644);
      }
    }));

  it("treats a prompt path that is a file as an empty directory", () =>
    withTempHome((_home, cwd) => {
      const notADir = join(cwd, "AGENTS.gpt-5.5.md");
      writeFileSync(notADir, "exact content");

      expect(findPrompt("gpt-5.5", [notADir])).toBeUndefined();
    }));
});

describe("before_agent_start systemPrompt handling", () => {
  it("appends prompt as string when event.systemPrompt is a string (Pi)", () =>
    withTempHome((_home, cwd) => {
      writeFileSync(join(cwd, ".agents", "AGENTS.claude-3-7-sonnet.md"), "Special rules");

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
      writeFileSync(join(cwd, ".agents", "AGENTS.claude-3-7-sonnet.md"), "Special rules");

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
