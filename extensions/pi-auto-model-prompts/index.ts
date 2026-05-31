import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// --- 类型 ---

interface Config {
  enabled: boolean;
}

type Prompt =
  | { path: string; priority: number; kind: "exact"; modelId: string }
  | { path: string; priority: number; kind: "prefix"; prefix: string }
  | { path: string; priority: number; kind: "wildcard" };

// --- 配置加载 ---

function loadConfig(cwd: string): Config {
  const paths = [
    join(homedir(), ".pi", "agent", "auto-model-prompts.json"),
    join(cwd, ".pi", "auto-model-prompts.json"),
  ];

  const cfg: Config = { enabled: true };

  for (const p of paths) {
    if (!existsSync(p)) continue;
    const parsed = JSON.parse(readFileSync(p, "utf-8"));
    if (typeof parsed.enabled === "boolean") cfg.enabled = parsed.enabled;
  }

  return cfg;
}

function getPromptDirs(cwd: string): string[] {
  return [
    join(cwd, ".pi", "auto-model-prompts"),
    join(homedir(), ".pi", "agent", "auto-model-prompts"),
  ];
}

// --- Prompt 扫描与匹配 ---

/**
 * 扫描目录下 .md 文件，按优先级降序排列。
 *
 * 优先级：
 * - 精确匹配（无 *）：最高
 * - 前缀匹配（以 * 结尾）：前缀越长越具体
 * - 通配 *.md：最低
 */
function scanPrompts(dir: string): Prompt[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const name = f.slice(0, -3);
      if (name === "*") return { path: join(dir, f), priority: 0, kind: "wildcard" as const };
      if (name.endsWith("*")) {
        const prefix = name.slice(0, -1);
        return { path: join(dir, f), priority: 10_000 + prefix.length, kind: "prefix" as const, prefix };
      }
      return { path: join(dir, f), priority: 20_000 + name.length, kind: "exact" as const, modelId: name };
    })
    .sort((a, b) => b.priority - a.priority);
}

function isMatch(modelId: string, prompt: Prompt): boolean {
  const mid = modelId.toLowerCase();
  if (prompt.kind === "exact") return mid === prompt.modelId.toLowerCase();
  if (prompt.kind === "prefix") return mid.startsWith(prompt.prefix.toLowerCase());
  return true;
}

function matchPrompt(modelId: string, prompts: Prompt[]): string | undefined {
  for (const prompt of prompts) {
    if (!isMatch(modelId, prompt)) continue;

    const content = readFileSync(prompt.path, "utf-8").trim();
    if (content) return content;
  }
  return undefined;
}

function findPrompt(modelId: string, dirs: string[]): string | undefined {
  for (const dir of dirs) {
    const content = matchPrompt(modelId, scanPrompts(dir));
    if (content) return content;
  }
  return undefined;
}

// --- 插件入口 ---

export default function (pi: ExtensionAPI) {
  let config: Config | undefined;

  pi.on("session_start", (_event, ctx) => {
    config = loadConfig(ctx.cwd);
  });

  pi.on("before_agent_start", (event, ctx) => {
    if (config?.enabled === false) return;

    const modelId = ctx.model?.id;
    if (!modelId) return;

    const content = findPrompt(modelId, getPromptDirs(ctx.cwd));
    if (!content) return;

    return {
      systemPrompt: event.systemPrompt + "\n\n" + content,
    };
  });
}
