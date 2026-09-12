import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import autoModelPrompts, { loadConfig, getConfigPaths, findPrompt, getPromptDirs } from "../src/index.ts";

/** 测试进程所在宿主目录名与其兼容回退目录名 (与 src 的实现同源, 避免把 .pi/.omp 写死) */
const HOST = CONFIG_DIR_NAME || ".pi";
const LEGACY = HOST === ".pi" ? ".omp" : ".pi";

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
      const dir = join(cwd, ".pi", "auto-model-prompts");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "gpt-5.5.md"), "exact content");
      writeFileSync(join(dir, "gpt-*.md"), "prefix content");
      writeFileSync(join(dir, "*.md"), "wildcard content");

      const dirs = getPromptDirs(cwd, home);
      expect(findPrompt("gpt-5.5", dirs)).toBe("exact content");
    }));

  it("falls back to prefix then wildcard", () =>
    withTempHome((home, cwd) => {
      const dir = join(cwd, ".pi", "auto-model-prompts");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "gpt-*.md"), "prefix content");
      writeFileSync(join(dir, "*.md"), "wildcard content");

      const dirs = getPromptDirs(cwd, home);
      expect(findPrompt("gpt-4o", dirs)).toBe("prefix content");
      expect(findPrompt("claude-sonnet", dirs)).toBe("wildcard content");
    }));

  it("matches only the part after the last slash", () =>
    withTempHome((home, cwd) => {
      const dir = join(cwd, ".pi", "auto-model-prompts");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "fixture-alpha.md"), "exact content");
      writeFileSync(join(dir, "namespace*.md"), "namespaced content");
      writeFileSync(join(dir, "*.md"), "wildcard content");

      const dirs = getPromptDirs(cwd, home);
      expect(findPrompt("outer/namespace/fixture-alpha", dirs)).toBe("exact content");
      expect(findPrompt("namespace/fixture-beta", dirs)).toBe("wildcard content");
    }));

  it("matches text surrounded by wildcards", () =>
    withTempHome((home, cwd) => {
      const dir = join(cwd, ".pi", "auto-model-prompts");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "*fixture-alpha*.md"), "contains content");
      writeFileSync(join(dir, "*.md"), "wildcard content");

      const dirs = getPromptDirs(cwd, home);
      expect(findPrompt("namespace/my-fixture-alpha-preview", dirs)).toBe("contains content");
      expect(findPrompt("namespace/fixture-beta", dirs)).toBe("wildcard content");
    }));

  it("ignores empty files", () =>
    withTempHome((home, cwd) => {
      const dir = join(cwd, ".pi", "auto-model-prompts");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "gpt-5.5.md"), "   ");
      writeFileSync(join(dir, "*.md"), "fallback");

      const dirs = getPromptDirs(cwd, home);
      expect(findPrompt("gpt-5.5", dirs)).toBe("fallback");
    }));

  it("returns undefined when no match", () =>
    withTempHome((home, cwd) => {
      const dirs = getPromptDirs(cwd, home);
      expect(findPrompt("gpt-5.5", dirs)).toBeUndefined();
    }));

  it("prefers the active host's prompt over the other host's", () =>
    withTempHome((home, cwd) => {
      const hostDir = join(cwd, HOST, "auto-model-prompts");
      mkdirSync(hostDir, { recursive: true });
      writeFileSync(join(hostDir, "gpt-5.5.md"), "host content");

      const legacyDir = join(cwd, LEGACY, "auto-model-prompts");
      mkdirSync(legacyDir, { recursive: true });
      writeFileSync(join(legacyDir, "gpt-5.5.md"), "legacy content");

      expect(findPrompt("gpt-5.5", getPromptDirs(cwd, home))).toBe("host content");
    }));

  it("falls back to the other host's prompt when the active host has none", () =>
    withTempHome((home, cwd) => {
      const legacyDir = join(cwd, LEGACY, "auto-model-prompts");
      mkdirSync(legacyDir, { recursive: true });
      writeFileSync(join(legacyDir, "gpt-5.5.md"), "legacy content");

      expect(findPrompt("gpt-5.5", getPromptDirs(cwd, home))).toBe("legacy content");
    }));
});

describe("before_agent_start systemPrompt handling", () => {
  it("appends prompt as string when event.systemPrompt is a string (Pi)", () =>
    withTempHome((home, cwd) => {
      const dir = join(cwd, HOST, "auto-model-prompts");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "claude-3-7-sonnet.md"), "Special rules");

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
    withTempHome((home, cwd) => {
      const dir = join(cwd, HOST, "auto-model-prompts");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "claude-3-7-sonnet.md"), "Special rules");

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
