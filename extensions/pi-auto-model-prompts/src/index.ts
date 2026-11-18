import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** prompt 与配置所在目录名, 项目级与全局同名, 与宿主配置目录 (.pi/.omp) 无关 */
const AGENTS_DIR = ".agents";

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
const FILE_PREFIX = "AGENTS.";
const SECTION_NAME = "auto_model_prompt";

type Prompt =
  | { path: string; priority: number; kind: "exact"; modelId: string }
  | { path: string; priority: number; kind: "prefix"; prefix: string }
  | { path: string; priority: number; kind: "contains"; text: string }
  | { path: string; priority: number; kind: "wildcard" };

// --- 配置加载 ---

export function getConfigPaths(cwd: string, homeDir = homedir()): string[] {
  // 顺序即优先级: loadConfig 后读的覆盖先读的, 故全局在前
  return [
    join(homeDir, AGENTS_DIR, EXTENSION_NAME, "config.json"),
    join(cwd, AGENTS_DIR, EXTENSION_NAME, "config.json"),
  ];
}

function isBoolean(v: any): v is boolean {
  return typeof v === "boolean";
}

export function loadConfig(cwd: string, homeDir = homedir()): Config {
  const cfg: Config = { ...DEFAULT_CONFIG };

  for (const p of getConfigPaths(cwd, homeDir)) {
    if (!existsSync(p)) continue;
    const parsed = JSON.parse(readFileSync(p, "utf-8"));
    if (isBoolean(parsed.enabled)) cfg.enabled = parsed.enabled;
    if (isBoolean(parsed.liveReload)) cfg.liveReload = parsed.liveReload;
  }

  return cfg;
}

/** prompt 目录, 顺序即优先级: 项目 `.agents` > 全局 `~/.agents` (findPrompt 取首个命中) */
export function getPromptDirs(cwd: string, homeDir = homedir()): string[] {
  return [join(cwd, AGENTS_DIR), join(homeDir, AGENTS_DIR)];
}

// --- Prompt 扫描与匹配 ---

/**
 * 扫描目录下 `AGENTS.<matcher>.md` 文件，按优先级降序排列。
 *
 * 优先级：
 * - 精确匹配（无 *）：最高
 * - 前缀匹配（以 * 结尾）：前缀越长越具体
 * - 包含匹配（以 * 开头和结尾）
 * - 通配 *：最低
 */
function scanPrompts(dir: string): Prompt[] {
  if (!existsSync(dir)) return [];

  let entries: string[];
  // .agents 本身是普通文件时 readdirSync 抛 ENOTDIR, 一处坏路径不该让整轮注入消失
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  return entries
    .flatMap((f): Prompt[] => {
      // 前缀比对与 matcher 一样忽略大小写, 否则 macOS 上手打 agents.x.md 会静默失效
      if (f.slice(0, FILE_PREFIX.length).toUpperCase() !== FILE_PREFIX || !f.endsWith(".md")) return [];
      const name = f.slice(FILE_PREFIX.length, -3);
      // matcher 为空即裸 AGENTS.md, 它是宿主规则文件, 不参与 prompt 匹配
      if (!name) return [];
      const path = join(dir, f);
      // 同名目录与断链软链会让后续读取抛出, 这类条目直接跳过
      try {
        if (!statSync(path).isFile()) return [];
      } catch {
        return [];
      }
      if (name === "*") return [{ path, priority: 0, kind: "wildcard" as const }];
      if (name.startsWith("*") && name.endsWith("*")) {
        const text = name.slice(1, -1);
        return [{ path, priority: 5_000 + text.length, kind: "contains" as const, text }];
      }
      if (name.endsWith("*")) {
        const prefix = name.slice(0, -1);
        return [{ path, priority: 10_000 + prefix.length, kind: "prefix" as const, prefix }];
      }
      return [{ path, priority: 20_000 + name.length, kind: "exact" as const, modelId: name }];
    })
    .sort((a, b) => b.priority - a.priority);
}

function isMatch(modelId: string, prompt: Prompt): boolean {
  const mid = modelId.slice(modelId.lastIndexOf("/") + 1).toLowerCase();
  if (prompt.kind === "exact") return mid === prompt.modelId.toLowerCase();
  if (prompt.kind === "prefix") return mid.startsWith(prompt.prefix.toLowerCase());
  if (prompt.kind === "contains") return mid.includes(prompt.text.toLowerCase());
  return true;
}

function matchPrompt(modelId: string, prompts: Prompt[]): string | undefined {
  for (const prompt of prompts) {
    if (!isMatch(modelId, prompt)) continue;

    let content: string;
    // 读不到（权限等）就换下一个候选, 而不是把异常抛给宿主丢掉这一轮的注入
    try {
      content = readFileSync(prompt.path, "utf-8").trim();
    } catch {
      continue;
    }
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

    // pi：写结构化 section，才会进会话记录与导出；不命中的轮次不写，pi 自动删掉旧 section
    // SAFETY: omp 宿主不提供 systemPromptOptions
    const sections = (event.systemPromptOptions as typeof event.systemPromptOptions | undefined)
      ?.sections;
    if (sections) {
      sections[SECTION_NAME] = cachedPrompt;
      return;
    }

    const extra = `# AUTO MODEL PROMPT(模型特别规则)\n\n${cachedPrompt}`;
    // omp 的 systemPrompt 是 string[]：数组必须整体入列，否则被模板字符串按逗号拼成
    // 一整段。本扩展按 pi 类型编译，这里显式放宽类型
    if (Array.isArray(event.systemPrompt)) {
      return {
        systemPrompt: [...event.systemPrompt, extra],
      } as unknown as { systemPrompt: string };
    }
    // 没有 systemPromptOptions 的旧版 pi 只能整段追加（peer 范围是 "*"，旧宿主仍可能加载）
    return {
      systemPrompt: `${event.systemPrompt}\n\n${extra}`,
    };
  });
}
