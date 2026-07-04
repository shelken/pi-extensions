import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// --- 类型 ---

interface Config {
  enabled: boolean;
  /**
   * 是否在每次发消息时实时读取 prompt 文件（当前轮立即反映文件改动）。
   * false 时只在 session_start（含 /reload）时读取一次并缓存，改文件后需 /reload 才生效。
   */
  liveReload: boolean;
}

const DEFAULT_CONFIG: Config = { enabled: true, liveReload: false };

const EXTENSION_NAME = "pi-auto-model-prompts";

type Prompt =
  | { path: string; priority: number; kind: "exact"; modelId: string }
  | { path: string; priority: number; kind: "prefix"; prefix: string }
  | { path: string; priority: number; kind: "wildcard" };

// --- 配置加载 ---

export function getConfigPaths(cwd: string, homeDir = homedir()): string[] {
  return [
    join(homeDir, ".pi", "agent", "extensions", EXTENSION_NAME, "config.json"),
    join(cwd, ".pi", "extensions", EXTENSION_NAME, "config.json"),
  ];
}

export function loadConfig(cwd: string, homeDir = homedir()): Config {
  const cfg: Config = { ...DEFAULT_CONFIG };

  for (const p of getConfigPaths(cwd, homeDir)) {
    if (!existsSync(p)) continue;
    const parsed = JSON.parse(readFileSync(p, "utf-8"));
    if (typeof parsed.enabled === "boolean") cfg.enabled = parsed.enabled;
    if (typeof parsed.liveReload === "boolean") cfg.liveReload = parsed.liveReload;
  }

  return cfg;
}

export function getPromptDirs(cwd: string, homeDir = homedir()): string[] {
  return [
    join(cwd, ".pi", "auto-model-prompts"),
    join(homeDir, ".pi", "agent", "auto-model-prompts"),
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

export function findPrompt(modelId: string, dirs: string[]): string | undefined {
  for (const dir of dirs) {
    const content = matchPrompt(modelId, scanPrompts(dir));
    if (content) return content;
  }
  return undefined;
}

// --- 插件入口 ---

export default function (pi: ExtensionAPI) {
  let config: Config = { ...DEFAULT_CONFIG };
  // 懒加载缓存：仅在 before_agent_start 时填充 / 刷新，不在 session_start 预热。
  // 缓存同时记录「为哪个模型缓存」，模型变化时自动失效。
  let cachedPrompt: string | undefined;
  let cachedForModelId: string | undefined;

  pi.on("session_start", (_event, ctx) => {
    config = loadConfig(ctx.cwd);
  });

  pi.on("before_agent_start", (event, ctx) => {
    if (config.enabled === false) return;

    const modelId = ctx.model?.id;
    if (!modelId) return;

    // liveReload=true 每次实时读；liveReload=false 仅在模型变化时重读。
    // 不响应 model_select：所有判断和读取都集中在这里，避免缓存提前变动。
    if (config.liveReload || modelId !== cachedForModelId) {
      cachedPrompt = findPrompt(modelId, getPromptDirs(ctx.cwd));
      cachedForModelId = modelId;
    }
    if (!cachedPrompt) return;

    return {
      systemPrompt: `${event.systemPrompt}\n\n# AUTO MODEL PROMPT(模型特别规则)\n\n${cachedPrompt}`,
    };
  });
}
