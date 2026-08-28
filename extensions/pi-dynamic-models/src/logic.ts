import { createHash } from "node:crypto";

/** 模型 id 列表稳定 hash（排序后 md5）。 */
export function hashModelIds(ids: string[]): string {
  return createHash("md5").update([...ids].sort().join("\0")).digest("hex");
}

/** force 或缺失/过期时重新发现 provider 模型。 */
export function shouldRefreshProviderCache(
  force: boolean,
  hasCache: boolean,
  isFresh: boolean,
): boolean {
  return force || !hasCache || !isFresh;
}

/**
 * 远端列表拉取失败：只用磁盘旧 ids 回退，禁止写缓存（写盘会刷新 mtime，把失败伪装成 6h 新鲜）。
 */
export function providerFetchFailureFallback(
  diskModelIds: string[] | undefined,
): { ids: string[]; source: "stale"; writeCache: false } | null {
  if (!diskModelIds || diskModelIds.length === 0) return null;
  return { ids: diskModelIds, source: "stale", writeCache: false };
}

/** 失败冷却是否生效：最近失败在冷却期内 → true（不应发网）。 */
export function inFailureCooldown(
  lastFailedUnix: number | undefined,
  now: number,
  cooldownMs: number,
): boolean {
  if (!lastFailedUnix) return false;
  return now - lastFailedUnix < cooldownMs;
}

/** models.dev 未提供 effort 时使用的硬编码映射。 */
export function getAutoThinkingLevelMap(
  reasoning: boolean,
):
  | {
      minimal: "low";
      low: "low";
      medium: "medium";
      high: "high";
      xhigh: "xhigh";
      max: "max";
    }
  | undefined {
  return reasoning
    ? {
        minimal: "low",
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: "xhigh",
        max: "max",
      }
    : undefined;
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
  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return [];
    }
    if (raw.includes("*")) {
      return [...providersWithBaseUrl];
    }
    return [...raw];
  }
  return [raw];
}

/** glob（* / ?）→ 是否匹配 id；大小写不敏感。 */
export function matchesExcludePattern(id: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i").test(id);
}

export type ExcludeFilterResult = {
  kept: string[];
  excluded: string[];
};

export function filterByExcludePatterns(
  ids: string[],
  patterns: string[] | undefined,
): ExcludeFilterResult {
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
