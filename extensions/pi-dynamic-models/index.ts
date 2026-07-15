/**
 * Pi Dynamic Models
 *
 * 自动发现 models.json 中指定 provider 的远端模型，使用 models.dev registry 补全模型参数。
 * 匹配先归一化模型名，再统一收集候选，最后按模型家族偏好、路由提示和完整对齐程度选最优。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import {
  flattenRegistry,
  lookupModel,
  toPiCost,
  toPiInput,
  type RegistryData,
} from "./src/matcher.ts";

interface PluginConfig {
  enable: boolean;
  enableProviders: string[];
  debug?: boolean;
}

interface CacheEntry {
  etag: string;
  data: RegistryData;
}

interface ProviderConfig {
  baseUrl: string;
  apiKey?: string;
  api?: string;
  existingModels: Set<string>;
}

interface ProviderModelCache {
  hash: string;
  modelIds: string[];
}

const AGENT_DIR = join(homedir(), ".pi", "agent");
const MODELS_JSON_PATH = join(AGENT_DIR, "models.json");
const CACHE_DIR = join(AGENT_DIR, "cache");
const REGISTRY_CACHE_FILE = join(CACHE_DIR, "models-registry.json");
const PROVIDER_CACHE_DIR = join(CACHE_DIR, "provider-models");
const EXTENSION_NAME = "pi-dynamic-models";
const LOG_DIR = join(AGENT_DIR, "logs");
const LOG_FILE = join(LOG_DIR, "pi-dynamic-models.log");
const REGISTRY_URL = "https://models.dev/api.json";
const REGISTRY_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const PROVIDER_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

let isDebug = false;

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] ${msg}`;
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, line + "\n", "utf-8");
  } catch {
    // 日志失败不能阻塞 provider 注册。
  }
  if (isDebug) console.warn(line);
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch (e: any) {
    if (e?.code !== "ENOENT") log(`Read ${path} failed: ${e}`);
    return null;
  }
}

export function getConfigPaths(cwd: string, homeDir = homedir()): string[] {
  return [
    join(homeDir, ".pi", "agent", "extensions", EXTENSION_NAME, "config.json"),
    join(cwd, ".pi", "extensions", EXTENSION_NAME, "config.json"),
  ];
}

function loadConfig(cwd: string): PluginConfig | null {
  let config: PluginConfig | null = null;
  for (const path of getConfigPaths(cwd)) {
    const parsed = readJson<Partial<PluginConfig>>(path);
    if (!parsed) continue;
    config = { ...config, ...parsed } as PluginConfig;
  }
  return config;
}

function ensureParentDir(path: string): void {
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
}

function readRegistryCache(): CacheEntry | null {
  try {
    return JSON.parse(readFileSync(REGISTRY_CACHE_FILE, "utf-8")) as CacheEntry;
  } catch {
    return null;
  }
}

function isRegistryCacheFresh(): boolean {
  try {
    return Date.now() - statSync(REGISTRY_CACHE_FILE).mtimeMs < REGISTRY_CACHE_MAX_AGE_MS;
  } catch {
    return false;
  }
}

function writeRegistryCache(etag: string, data: RegistryData): void {
  ensureParentDir(REGISTRY_CACHE_FILE);
  writeFileSync(REGISTRY_CACHE_FILE, JSON.stringify({ etag, data }), "utf-8");
}

async function fetchRegistry(): Promise<{
  data: RegistryData;
  etag: string;
  fromCache: boolean;
}> {
  const cached = readRegistryCache();
  if (cached && isRegistryCacheFresh()) {
    log(`Registry: fresh cache, skip network (${Object.keys(cached.data).length} providers)`);
    return { data: cached.data, etag: cached.etag, fromCache: true };
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (cached?.etag) headers["If-None-Match"] = cached.etag;

  try {
    const res = await fetch(REGISTRY_URL, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 304 && cached) {
      log(`Registry: 304 Not Modified, using cache (${Object.keys(cached.data).length} providers)`);
      return { data: cached.data, etag: cached.etag, fromCache: true };
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const etag =
      res.headers.get("etag") ??
      createHash("md5").update(`${Date.now()}`).digest("hex");
    const data = (await res.json()) as RegistryData;
    writeRegistryCache(etag, data);

    const modelCount = Object.values(data).reduce(
      (sum, provider) => sum + (provider.models ? Object.keys(provider.models).length : 0),
      0,
    );
    log(`Registry: fetched ${Object.keys(data).length} providers, ${modelCount} models (ETag: ${etag})`);
    return { data, etag, fromCache: false };
  } catch (err) {
    if (cached) {
      log(`Registry unreachable (${err}), using cached data`);
      return { data: cached.data, etag: cached.etag, fromCache: true };
    }
    throw err;
  }
}

function providerCachePath(providerName: string): string {
  return join(PROVIDER_CACHE_DIR, `${providerName}.json`);
}

function readProviderCache(providerName: string): ProviderModelCache | null {
  try {
    return JSON.parse(readFileSync(providerCachePath(providerName), "utf-8")) as ProviderModelCache;
  } catch {
    return null;
  }
}

function writeProviderCache(providerName: string, cache: ProviderModelCache): void {
  const path = providerCachePath(providerName);
  ensureParentDir(path);
  writeFileSync(path, JSON.stringify(cache), "utf-8");
}

function isProviderCacheFresh(providerName: string): boolean {
  try {
    return Date.now() - statSync(providerCachePath(providerName)).mtimeMs < PROVIDER_CACHE_MAX_AGE_MS;
  } catch {
    return false;
  }
}

function hashModelIds(ids: string[]): string {
  return createHash("md5").update([...ids].sort().join("\0")).digest("hex");
}

function resolvePiValue(value: string | undefined): string | undefined {
  if (!value) return value;
  const match = value.match(/^\$\{?(\w+)\}?$/);
  if (match) return process.env[match[1]] ?? value;
  return value;
}

function readModelsJson(): Record<string, any> | null {
  return readJson<Record<string, any>>(MODELS_JSON_PATH);
}

function extractProviderConfig(
  modelsJson: Record<string, any>,
  providerName: string,
): ProviderConfig | null {
  const provider = modelsJson.providers?.[providerName];
  if (!provider) {
    log(`Provider "${providerName}": not found in models.json`);
    return null;
  }
  if (!provider.baseUrl) {
    log(`Provider "${providerName}": no baseUrl in models.json, skip`);
    return null;
  }

  const existingModels = new Set<string>();
  if (Array.isArray(provider.models)) {
    for (const model of provider.models) {
      if (model.id) existingModels.add(model.id);
    }
  }

  return {
    baseUrl: provider.baseUrl.replace(/\/+$/, ""),
    apiKey: resolvePiValue(provider.apiKey),
    api: provider.api,
    existingModels,
  };
}

async function fetchRemoteModels(cfg: ProviderConfig): Promise<string[]> {
  // baseUrl 可能带 /v1（openai 系）也可能不带（anthropic 系，models 端点实际在 /v1/models）。
  // 优先用原样 baseUrl + /models；不含 /v1 时额外追加 /v1/models 作为首选候选，失败再回退无 v1。
  const candidates: string[] = [];
  if (/\/v1\/?$/.test(cfg.baseUrl)) {
    candidates.push(`${cfg.baseUrl}/models`);
  } else {
    candidates.push(`${cfg.baseUrl}/v1/models`);
    candidates.push(`${cfg.baseUrl}/models`);
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

  let lastErr: unknown;
  for (const url of candidates) {
    log(`Fetching ${url} ...`);
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        log(`  ✗ ${lastErr}, try next candidate`);
        continue;
      }
      const body = (await res.json()) as { data?: Array<{ id: string }> };
      const ids = (body.data ?? []).map((model) => model.id);
      log(`  → ${ids.length} models returned`);
      return ids;
    } catch (e) {
      lastErr = e;
      log(`  ✗ unreachable: ${e}, try next candidate`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("all candidates failed");
}

type FlatRegistry = ReturnType<typeof flattenRegistry>;

type AutoModel = {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: ReturnType<typeof toPiCost>;
  contextWindow: number;
  maxTokens: number;
};

/** 仅返回 models.json 尚未声明的 id，供 eager/async 共用。 */
export function filterNewModelIds(discoveredIds: string[], existing: Set<string>): string[] {
  return discoveredIds.filter((id) => !existing.has(id));
}

function buildAutoModel(id: string, registry: FlatRegistry): AutoModel {
  const entry = lookupModel(id, registry);
  if (!entry) {
    return {
      id,
      name: `${id} (AUTO)`,
      reasoning: false,
      input: ["text"],
      cost: toPiCost(),
      contextWindow: 128_000,
      maxTokens: 16_384,
    };
  }

  const model = entry.model;
  return {
    id,
    name: `${model.name ?? id} (AUTO)`,
    reasoning: model.reasoning ?? false,
    input: toPiInput(model.modalities?.input, model.attachment),
    cost: toPiCost(model.cost),
    contextWindow: model.limit?.context ?? 128_000,
    maxTokens: model.limit?.output ?? 16_384,
  };
}

function registerProviderModels(
  pi: ExtensionAPI,
  providerName: string,
  providerCfg: ProviderConfig,
  // models.json 原始条目 + AUTO 模型；pi 侧类型为 ProviderModelConfig[]
  existingRaw: any[],
  discoveredModels: AutoModel[],
): void {
  pi.registerProvider(providerName, {
    baseUrl: providerCfg.baseUrl,
    apiKey: providerCfg.apiKey ?? "none",
    authHeader: !!providerCfg.apiKey,
    api: providerCfg.api ?? "openai-completions",
    models: [...existingRaw, ...discoveredModels],
  });
}

function resolveEnabledConfig(): {
  config: PluginConfig;
  modelsJson: Record<string, any>;
} | null {
  const config = loadConfig(process.cwd());
  if (!config) {
    log(`Config not found in standard extension config paths, skip`);
    return null;
  }

  isDebug = config.debug ?? false;
  if (isDebug) log("Debug mode ON");
  if (!config.enable) {
    log("Disabled via config.enable = false");
    return null;
  }
  if (!Array.isArray(config.enableProviders) || config.enableProviders.length === 0) {
    log("No enableProviders configured, skip");
    return null;
  }

  const modelsJson = readModelsJson();
  if (!modelsJson?.providers) {
    log("models.json not found or invalid, skip");
    return null;
  }

  return { config, modelsJson };
}

/**
 * factory 阶段同步注册：只用磁盘 cache，不发网络。
 * pi 会在 createAgentSessionServices 里 flush pendingProviderRegistrations，
 * 早于 session restore；否则 cpa/* (AUTO) 在 restore 时还不存在。
 */
function eagerRegisterFromCache(pi: ExtensionAPI): void {
  try {
    const resolved = resolveEnabledConfig();
    if (!resolved) return;

    const { config, modelsJson } = resolved;
    log(`Eager register from cache; providers: ${config.enableProviders.join(", ")}`);

    let registry: FlatRegistry = new Map();
    const regCache = readRegistryCache();
    if (regCache?.data) {
      registry = flattenRegistry(regCache.data);
      log(`  registry cache: ${registry.size} entries`);
    } else {
      log(`  registry cache missing; AUTO models use defaults until session_start`);
    }

    for (const providerName of config.enableProviders) {
      const providerCfg = extractProviderConfig(modelsJson, providerName);
      if (!providerCfg) continue;

      // 不限 freshness：restore 需要「上一次发现过」的 id，过期也比没有强
      const cached = readProviderCache(providerName);
      if (!cached?.modelIds?.length) {
        log(`  [eager ${providerName}] no provider cache, defer to session_start`);
        continue;
      }

      const newIds = filterNewModelIds(cached.modelIds, providerCfg.existingModels);
      if (newIds.length === 0) {
        log(`  [eager ${providerName}] all ${cached.modelIds.length} already in models.json`);
        continue;
      }

      const discoveredModels = newIds.map((id) => buildAutoModel(id, registry));
      const existingRaw: any[] = modelsJson.providers[providerName]?.models ?? [];
      registerProviderModels(pi, providerName, providerCfg, existingRaw, discoveredModels);
      log(`  [eager ${providerName}] registered ${newIds.length} cached models`);
    }
  } catch (err) {
    log(`Eager register failed: ${err}`);
  }
}

async function initModels(pi: ExtensionAPI) {
  const t0 = Date.now();

  try {
    const resolved = resolveEnabledConfig();
    if (!resolved) return;

    const { config, modelsJson } = resolved;
    log(`Enabled providers: ${config.enableProviders.join(", ")}`);
    let t = Date.now();

    log(`models.json providers: ${Object.keys(modelsJson.providers).join(", ")}`);
    log(`  step2_modelsjson: ${Date.now() - t}ms`);
    t = Date.now();
    const { data: registryData, fromCache } = await fetchRegistry();
    log(`  step3_registry: ${Date.now() - t}ms (${fromCache ? "cached" : "fresh"})`);
    t = Date.now();
    const registry = flattenRegistry(registryData);
    log(`  flatten: ${Date.now() - t}ms, ${registry.size} entries`);

    async function processProvider(
      providerName: string,
      providerCfg: ProviderConfig,
      registry: FlatRegistry,
    ) {
      const pt = Date.now();

      // 优先使用 fresh cache，跳过网络请求
      let discoveredIds: string[];
      let cacheSource: "fresh" | "stale" | null = null;

      const freshCache = isProviderCacheFresh(providerName) ? readProviderCache(providerName) : null;
      if (freshCache && freshCache.modelIds.length > 0) {
        discoveredIds = freshCache.modelIds;
        cacheSource = "fresh";
        log(`  [${providerName}] cache hit (${discoveredIds.length} models, ${Date.now() - pt}ms)`);
      } else {
        try {
          discoveredIds = await fetchRemoteModels(providerCfg);
          writeProviderCache(providerName, {
            hash: hashModelIds(discoveredIds),
            modelIds: discoveredIds,
          });
        } catch (err) {
          log(`  [${providerName}] ✗ unreachable: ${err}`);
          const cached = readProviderCache(providerName);
          if (!cached || cached.modelIds.length === 0) return null;
          discoveredIds = cached.modelIds;
          cacheSource = "stale";
          log(`  [${providerName}] → fallback cache (${discoveredIds.length} models)`);
        }
      }

      if (discoveredIds.length === 0) {
        log(`  [${providerName}] ✗ 0 models`);
        return null;
      }

      const newIds = filterNewModelIds(discoveredIds, providerCfg.existingModels);
      if (newIds.length === 0) {
        log(`  [${providerName}] ✓ all ${discoveredIds.length} models already defined`);
        return null;
      }

      log(`  [${providerName}] ${providerCfg.existingModels.size} existing + ${newIds.length} new`);

      let matchedCount = 0;
      const discoveredModels = newIds.map((id) => {
        const model = buildAutoModel(id, registry);
        const entry = lookupModel(id, registry);
        if (!entry) {
          log(`    + ${id} → (defaults, no registry match)`);
        } else {
          matchedCount++;
          log(
            `    + ${id} → [${entry.provider}] ctx:${model.contextWindow} reasoning:${model.reasoning} input:${model.input}`,
          );
        }
        return model;
      });

      log(
        `  [${providerName}] done: ${matchedCount} matched, ${Date.now() - pt}ms${cacheSource ? ` (${cacheSource} cache)` : ""}`,
      );

      return {
        name: providerName,
        cfg: providerCfg,
        discoveredModels,
      };
    }

    const results = await Promise.all(
      config.enableProviders.map(async (providerName) => {
        const providerCfg = extractProviderConfig(modelsJson, providerName);
        if (!providerCfg) return null;
        return processProvider(providerName, providerCfg, registry);
      }),
    );

    for (const result of results) {
      if (!result) continue;
      const existingRaw: any[] = modelsJson.providers[result.name]?.models ?? [];
      registerProviderModels(pi, result.name, result.cfg, existingRaw, result.discoveredModels);
    }
  } catch (err) {
    log(`Fatal error: ${err}`);
    if (err instanceof Error && err.stack) {
      for (const line of err.stack.split("\n")) log(`  ${line}`);
    }
  }

  log(`=== End (${Date.now() - t0}ms) ===`);
}

export default function (pi: ExtensionAPI) {
  // 同步：把上次发现的 AUTO 模型挂上，才能被 session restore 找到
  eagerRegisterFromCache(pi);
  pi.on("session_start", () => {
    void initModels(pi).catch((err) => log(`Unhandled: ${err}`));
  });
}
