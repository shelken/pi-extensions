import { createHash } from "node:crypto";

/** 模型 id 列表稳定 hash（排序后 md5）。 */
export function hashModelIds(ids: string[]): string {
  return createHash("md5").update([...ids].sort().join("\0")).digest("hex");
}

/** 仅返回 models.json 尚未声明的 id。 */
export function filterNewModelIds(discoveredIds: string[], existing: Set<string>): string[] {
  return discoveredIds.filter((id) => !existing.has(id));
}

/** hash 相同则跳过重注册。 */
export function shouldSkipByHash(prev: string | undefined, next: string): boolean {
  return prev !== undefined && prev === next;
}

/**
 * 展开 enableProviders：
 * - 省略 / "*" / ["*"] → 全部有 baseUrl 的 provider
 * - 显式列表 → 原样（忽略列表里的 "*" 与其它混用时仍展开全部）
 * - [] → 空（不启用）
 */
export function resolveEnableProviders(
  raw: string[] | string | undefined,
  providersWithBaseUrl: string[],
): string[] {
  if (raw === undefined || raw === "*") {
    return [...providersWithBaseUrl];
  }
  if (typeof raw === "string") {
    return [raw];
  }
  if (raw.length === 0) {
    return [];
  }
  if (raw.includes("*")) {
    return [...providersWithBaseUrl];
  }
  return [...raw];
}

/** glob（* / ?）→ 是否匹配 id；大小写不敏感。 */
export function matchesExcludePattern(id: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i").test(id);
}

export function filterByExcludePatterns(
  ids: string[],
  patterns: string[] | undefined,
): { kept: string[]; excluded: string[] } {
  if (!patterns?.length) {
    return { kept: [...ids], excluded: [] };
  }
  const kept: string[] = [];
  const excluded: string[] = [];
  for (const id of ids) {
    if (patterns.some((p) => matchesExcludePattern(id, p))) {
      excluded.push(id);
    } else {
      kept.push(id);
    }
  }
  return { kept, excluded };
}

/** ctx:0 等不可用对话窗口的模型不进选择器。 */
export function isUsableChatModel(model: { contextWindow: number }): boolean {
  return model.contextWindow > 0;
}

export type ProviderRunSummary = {
  provider: string;
  manual: number;
  auto: number;
  matched: number;
  defaults: number;
  filtered: number;
  skipped: boolean;
  registered: boolean;
};

export function formatProviderSummary(s: ProviderRunSummary): string {
  if (s.skipped) {
    return `${s.provider}: ${s.manual} manual + ${s.auto} auto, unchanged`;
  }
  const parts = [
    `${s.provider}: ${s.manual} manual + ${s.auto} auto`,
    `${s.matched} matched`,
    `${s.defaults} default`,
  ];
  if (s.filtered > 0) parts.push(`filtered=${s.filtered}`);
  if (s.registered) parts.push("registered");
  return parts.join(", ");
}

export function formatStatusLine(summaries: ProviderRunSummary[]): string {
  if (summaries.length === 0) return "dynamic-models: idle";
  return summaries
    .map((s) => {
      if (s.skipped) return `${s.provider} ok`;
      return `${s.provider} +${s.auto}`;
    })
    .join(" · ");
}
