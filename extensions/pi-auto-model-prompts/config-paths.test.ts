import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import autoModelPrompts, { loadConfig, getConfigPaths, findPrompt, getPromptDirs } from "./index.ts";

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
    const pi = {
      on: vi.fn((event: string) => events.push(event)),
    } as unknown as ExtensionAPI;

    autoModelPrompts(pi);

    expect(events).toEqual(["session_start", "before_agent_start"]);
  });
});

describe("pi-auto-model-prompts config paths", () => {
  it("uses the standard global and project extension config paths", () => {
    expect(getConfigPaths("/repo/app", "/home/me")).toEqual([
      "/home/me/.pi/agent/extensions/pi-auto-model-prompts/config.json",
      "/repo/app/.pi/extensions/pi-auto-model-prompts/config.json",
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
});
