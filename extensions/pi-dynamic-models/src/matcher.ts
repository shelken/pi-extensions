export interface RegistryCost {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
}

export interface PiCost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface RegistryModel {
  id: string;
  name?: string;
  reasoning?: boolean;
  attachment?: boolean;
  modalities?: { input?: string[]; output?: string[] };
  limit?: { context?: number; output?: number };
  cost?: RegistryCost;
}

export interface RegistryProvider {
  models?: Record<string, RegistryModel>;
}

export type RegistryData = Record<string, RegistryProvider>;

export interface RegistryEntry {
  model: RegistryModel;
  provider: string;
  sourceKey: string;
}

const MODEL_SUFFIXES = [
  "-thinking",
  "-preview",
  "-image",
  "-agent",
  "-lite",
  "-low",
  "-high",
  "-medium",
  "-free",
  ":free",
  ":paid",
];

// ponytail: 顺序敏感——优先官方原厂 > 官方 cn > 知名托管 > 渠道转售。
// "minimax" 留到 miniMax/M 系列在 minimax 自己 key 下；同名 model 也存在 alibaba 渠道
// 时仍要走向 minimax。pattern 用 includes 而非 startsWith，避免 "gpt" 抢 "gpt-oss"。
const PREFERRED_PROVIDERS: Array<{ pattern: string; providers: string[] }> = [
	{ pattern: "gemini", providers: ["google", "google-vertex", "ollama-cloud"] },
	{ pattern: "gemma", providers: ["google", "ollama-cloud"] },
	{ pattern: "gpt", providers: ["openai"] },
	{ pattern: "o1", providers: ["openai"] },
	{ pattern: "o3", providers: ["openai"] },
	{ pattern: "claude", providers: ["anthropic"] },
	{ pattern: "deepseek", providers: ["deepseek"] },
	{ pattern: "minimax-m", providers: ["minimax", "minimax-cn"] },
	{ pattern: "minimax-", providers: ["minimax", "minimax-cn"] },
	{ pattern: "kimi", providers: ["moonshotai", "moonshotai-cn"] },
	{ pattern: "qwen", providers: ["alibaba-cn", "alibaba"] },
	{ pattern: "mistral", providers: ["mistral"] },
	{ pattern: "ministral", providers: ["mistral"] },
	{ pattern: "glm", providers: ["zhipuai", "zhipuai-coding-plan", "zai", "zai-coding-plan"] },
	{ pattern: "mimo", providers: ["xiaomi", "xiaomi-token-plan", "xiaomi-token-plan-cn", "xiaomi-token-plan-ams", "xiaomi-token-plan-sgp"] },
];

export function flattenRegistry(data: RegistryData): Map<string, RegistryEntry[]> {
  const map = new Map<string, RegistryEntry[]>();

  function addIndex(indexKey: string, entry: RegistryEntry): void {
    const arr = map.get(indexKey) ?? [];
    arr.push(entry);
    map.set(indexKey, arr);
  }

  for (const [providerName, provider] of Object.entries(data)) {
    if (!provider.models) continue;
    for (const [sourceKey, model] of Object.entries(provider.models)) {
      const entry: RegistryEntry = { model, provider: providerName, sourceKey };

      addIndex(sourceKey, entry);

      if (model.id && model.id !== sourceKey) {
        addIndex(model.id, entry);
      }

      const normalizedSourceKey = normalizeRegistryKey(sourceKey);
      if (normalizedSourceKey !== sourceKey && normalizedSourceKey !== model.id) {
        addIndex(normalizedSourceKey, entry);
      }

      if (model.id) {
        const normalizedModelId = normalizeRegistryKey(model.id);
        if (normalizedModelId !== model.id && normalizedModelId !== sourceKey) {
          addIndex(normalizedModelId, entry);
        }
      }
    }
  }

  return map;
}

function normalizeRegistryKey(id: string): string {
  return id.split("/").pop()!.toLowerCase();
}

function routeHintProvider(modelId: string): string | undefined {
  return /:(free|paid)$/.test(modelId) ? "openrouter" : undefined;
}

function pickBestEntry(
  entries: RegistryEntry[],
  modelId: string,
  routeHint?: string,
): RegistryEntry | undefined {
  if (entries.length === 0) return undefined;
  if (entries.length === 1) return entries[0];

  const pref = PREFERRED_PROVIDERS.find((p) => modelId.toLowerCase().includes(p.pattern));
  if (pref) {
    for (const provider of pref.providers) {
      const match = entries.find((e) => e.provider === provider);
      if (match) return match;
    }
  }

  if (routeHint) {
    const hinted = entries.find((e) => e.provider === routeHint);
    if (hinted) return hinted;
  }

  const exact = entries.find((e) => e.sourceKey === modelId);
  if (exact) return exact;

  const exactCaseInsensitive = entries.find(
    (e) => e.sourceKey.toLowerCase() === modelId.toLowerCase(),
  );
  if (exactCaseInsensitive) return exactCaseInsensitive;

  return entries[0];
}

export function lookupModel(
  modelId: string,
  registry: Map<string, RegistryEntry[]>,
): RegistryEntry | undefined {
  const candidates: RegistryEntry[] = [];
  const dedup = new Set<string>();
  const routeHint = routeHintProvider(modelId);

  function collect(id: string): void {
    const entries = registry.get(id);
    if (!entries) return;

    for (const entry of entries) {
      const sig = `${entry.provider}\x00${entry.sourceKey}`;
      if (dedup.has(sig)) continue;
      dedup.add(sig);
      candidates.push(entry);
    }
  }

  const ids = new Set<string>();
  ids.add(modelId);

  const noColon = modelId.includes(":") ? modelId.split(":")[0] : modelId;
  ids.add(noColon);

  const bare = noColon.split("/").pop()!;
  ids.add(bare);

  for (const suffix of MODEL_SUFFIXES) {
    if (bare.endsWith(suffix)) {
      const stripped = bare.slice(0, -suffix.length);
      if (stripped) ids.add(stripped);
    }
  }

  for (const id of ids) collect(id);

  if (candidates.length > 0) {
    return pickBestEntry(candidates, bare, routeHint);
  }

  for (const suffix of MODEL_SUFFIXES) {
    if (!bare.endsWith(suffix)) continue;
    const base = bare.slice(0, -suffix.length);
    const firstSeg = base.split(/[/:-]/)[0];

    for (const [key, entries] of registry) {
      if (key === base) continue;
      if (!key.startsWith(firstSeg)) continue;
      if (!key.startsWith(base)) continue;

      for (const entry of entries) {
        const sig = `${entry.provider}\x00${entry.sourceKey}`;
        if (dedup.has(sig)) continue;
        dedup.add(sig);
        candidates.push(entry);
      }
    }

    if (candidates.length > 0) {
      return pickBestEntry(candidates, bare, routeHint);
    }
  }

  let progressive = bare;
  for (;;) {
    const dashIdx = progressive.lastIndexOf("-");
    if (dashIdx <= 0) break;
    progressive = progressive.slice(0, dashIdx);
    collect(progressive);
    if (candidates.length > 0) {
      return pickBestEntry(candidates, bare, routeHint);
    }
  }

  return undefined;
}

export function toPiInput(
  modalities?: string[],
  attachment?: boolean,
): ("text" | "image")[] {
  return attachment && modalities?.includes("image")
    ? ["text", "image"]
    : ["text"];
}

export function toPiCost(cost?: RegistryCost): PiCost {
  return {
    input: cost?.input ?? 0,
    output: cost?.output ?? 0,
    cacheRead: cost?.cache_read ?? 0,
    cacheWrite: cost?.cache_write ?? 0,
  };
}
