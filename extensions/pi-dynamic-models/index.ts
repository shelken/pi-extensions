/**
 * Pi Dynamic Models
 *
 * 自动发现 models.json 中指定 provider 的远端模型，使用 models.dev registry 补全模型参数。
 * factory 同步用磁盘 cache 注册（供 session restore）；session_start 再刷新。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
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
import { getBuiltInModelDefs, getBuiltInModelIds } from "./src/builtin.ts";
import {
  filterByExcludePatterns,
  filterNewModelIds,
  formatProviderSummary,
  formatStatusLine,
  hashModelIds,
  isUsableChatModel,
  resolveEnableProviders,
  shouldSkipByHash,
  type ProviderRunSummary,
} from "./src/logic.ts";
import { collectExistingIds, mergeProviderModelList } from "./src/merge.ts";

interface PluginConfig {
  enable: boolean;
  /** 省略 / "*" / ["*"] = models.json 里所有带 baseUrl 的 provider */
  enableProviders?: string[] | string;
  /** glob，匹配则不注册为 AUTO（不改 models.json 手写项） */
  excludePatterns?: string[];
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
const STATUS_KEY = "dynamic-models";

let isDebug = false;

/** 进程内：provider → 已注册 AUTO id 列表 hash */
const registeredAutoHashes = new Map<string, string>();

/** 进程内 flatten memo */
let flatRegistryMemo: { key: string; map: FlatRegistry } | null = null;

/** 最近一次运行摘要（供 /dynamic-models status） */
let lastSummaries: ProviderRunSummary[] = [];
let lastStatusText = "dynamic-models: idle";
let lastEnabledProviders: string[] = [];
let lastInitError: string | null = null;

/** 后台 registry 刷新单飞 */
let registryRefreshInFlight: Promise<void> | null = null;

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

function debugLog(msg: string): void {
  if (isDebug) log(msg);
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
  // 磁盘更新后失效 flatten memo
  flatRegistryMemo = null;
}

function getFlatRegistry(data: RegistryData, key: string): FlatRegistry {
  if (flatRegistryMemo?.key === key) return flatRegistryMemo.map;
  const map = flattenRegistry(data);
  flatRegistryMemo = { key, map };
  return map;
}

async function fetchRegistryFromNetwork(cached: CacheEntry | null): Promise<{
  data: RegistryData;
  etag: string;
  fromCache: boolean;
}> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cached?.etag) headers["If-None-Match"] = cached.etag;

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
    res.headers.get("etag") ?? createHash("md5").update(`${Date.now()}`).digest("hex");
  const data = (await res.json()) as RegistryData;
  writeRegistryCache(etag, data);

  const modelCount = Object.values(data).reduce(
    (sum, provider) => sum + (provider.models ? Object.keys(provider.models).length : 0),
    0,
  );
  log(`Registry: fetched ${Object.keys(data).length} providers, ${modelCount} models (ETag: ${etag})`);
  return { data, etag, fromCache: false };
}

function scheduleRegistryRefresh(pi: ExtensionAPI): void {
  if (registryRefreshInFlight) return;
  const etagBefore = readRegistryCache()?.etag;
  registryRefreshInFlight = (async () => {
    try {
      const cached = readRegistryCache();
      const result = await fetchRegistryFromNetwork(cached);
      log("Registry: background refresh done");
      // etag 变化：清 hash 并用新 registry 再跑一轮（禁止再 SWR，避免环）
      if (result.etag !== etagBefore) {
        registeredAutoHashes.clear();
        flatRegistryMemo = null;
        await initModels(pi, { force: false, allowSwr: false });
      }
    } catch (err) {
      log(`Registry: background refresh failed: ${err}`);
    } finally {
      registryRefreshInFlight = null;
    }
  })();
}

/**
 * 读 registry：新鲜 cache 直接用；过期则先返回 stale 并后台刷新（SWR）；
 * force 时同步拉网。allowSwr=false 用于后台二次注册，避免循环。
 */
async function loadRegistry(options?: {
  force?: boolean;
  allowSwr?: boolean;
  pi?: ExtensionAPI;
}): Promise<{ data: RegistryData; etag: string; fromCache: boolean; stale: boolean }> {
  const cached = readRegistryCache();
  const force = options?.force ?? false;
  const allowSwr = options?.allowSwr ?? true;

  if (!force && cached && isRegistryCacheFresh()) {
    log(`Registry: fresh cache, skip network (${Object.keys(cached.data).length} providers)`);
    return { data: cached.data, etag: cached.etag, fromCache: true, stale: false };
  }

  if (!force && allowSwr && cached && !isRegistryCacheFresh()) {
    log(
      `Registry: stale cache, use now + background refresh (${Object.keys(cached.data).length} providers)`,
    );
    if (options?.pi) scheduleRegistryRefresh(options.pi);
    return { data: cached.data, etag: cached.etag, fromCache: true, stale: true };
  }

  try {
    const result = await fetchRegistryFromNetwork(cached);
    return { ...result, stale: false };
  } catch (err) {
    if (cached) {
      log(`Registry unreachable (${err}), using cached data`);
      return { data: cached.data, etag: cached.etag, fromCache: true, stale: true };
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

function resolvePiValue(value: string | undefined): string | undefined {
  if (!value) return value;
  const match = value.match(/^\$\{?(\w+)\}?$/);
  if (match) return process.env[match[1]] ?? value;
  return value;
}

function readModelsJson(): Record<string, any> | null {
  return readJson<Record<string, any>>(MODELS_JSON_PATH);
}

function listProvidersWithBaseUrl(modelsJson: Record<string, any>): string[] {
  const providers = modelsJson.providers ?? {};
  return Object.keys(providers).filter((name) => typeof providers[name]?.baseUrl === "string");
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

  const fromJsonIds: string[] = [];
  if (Array.isArray(provider.models)) {
    for (const model of provider.models) {
      if (model.id) fromJsonIds.push(model.id);
    }
  }

  // 内置 provider（如 openai）同 id 视为已存在：不覆盖参数，只补缺失
  const builtInIds = getBuiltInModelIds(providerName);
  const existingModels = collectExistingIds(fromJsonIds, builtInIds);
  if (builtInIds.length > 0) {
    log(
      `Provider "${providerName}": protect ${builtInIds.length} built-in + ${fromJsonIds.length} models.json ids`,
    );
  }

  return {
    baseUrl: provider.baseUrl.replace(/\/+$/, ""),
    apiKey: resolvePiValue(provider.apiKey),
    api: provider.api,
    existingModels,
  };
}

async function fetchRemoteModels(cfg: ProviderConfig): Promise<string[]> {
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
  existingRaw: any[],
  discoveredModels: AutoModel[],
): void {
  // registerProvider(models) 整表替换：必须带上内置 + models.json，再只追加新 AUTO
  const models = mergeProviderModelList({
    builtIn: getBuiltInModelDefs(providerName),
    fromModelsJson: existingRaw,
    autoNew: discoveredModels,
  });

  pi.registerProvider(providerName, {
    baseUrl: providerCfg.baseUrl,
    apiKey: providerCfg.apiKey ?? "none",
    authHeader: !!providerCfg.apiKey,
    api: providerCfg.api ?? "openai-completions",
    models: models as any[],
  });
}

type Resolved = {
  config: PluginConfig;
  modelsJson: Record<string, any>;
  providerNames: string[];
};

function resolveEnabledConfig(): Resolved | null {
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

  const modelsJson = readModelsJson();
  if (!modelsJson?.providers) {
    log("models.json not found or invalid, skip");
    return null;
  }

  const available = listProvidersWithBaseUrl(modelsJson);
  const providerNames = resolveEnableProviders(config.enableProviders, available);
  if (providerNames.length === 0) {
    log("No enableProviders resolved, skip");
    return null;
  }

  return { config, modelsJson, providerNames };
}

function buildAndFilterModels(
  newIds: string[],
  registry: FlatRegistry,
  excludePatterns: string[] | undefined,
): {
  models: AutoModel[];
  matched: number;
  defaults: number;
  filtered: number;
  autoHash: string;
} {
  const { kept: afterExclude, excluded } = filterByExcludePatterns(newIds, excludePatterns);
  let matched = 0;
  let defaults = 0;
  let filtered = excluded.length;
  const models: AutoModel[] = [];

  for (const id of afterExclude) {
    const model = buildAutoModel(id, registry);
    if (!isUsableChatModel(model)) {
      filtered++;
      debugLog(`    - ${id} → filtered (ctx:${model.contextWindow})`);
      continue;
    }
    const entry = lookupModel(id, registry);
    if (!entry) {
      defaults++;
      debugLog(`    + ${id} → (defaults, no registry match)`);
    } else {
      matched++;
      debugLog(
        `    + ${id} → [${entry.provider}] ctx:${model.contextWindow} reasoning:${model.reasoning}`,
      );
    }
    models.push(model);
  }

  // 含元数据，registry 更新 ctx/cost 等时不应被 id-only hash 误判 unchanged
  const autoHash = hashModelIds(
    models.map(
      (m) =>
        `${m.id}|${m.contextWindow}|${m.maxTokens}|${m.reasoning ? 1 : 0}|${m.name}`,
    ),
  );
  return { models, matched, defaults, filtered, autoHash };
}

function tryRegisterProvider(
  pi: ExtensionAPI,
  providerName: string,
  providerCfg: ProviderConfig,
  modelsJson: Record<string, any>,
  built: ReturnType<typeof buildAndFilterModels>,
  force: boolean,
): ProviderRunSummary {
  const manual = providerCfg.existingModels.size;
  const auto = built.models.length;
  const base: ProviderRunSummary = {
    provider: providerName,
    manual,
    auto,
    matched: built.matched,
    defaults: built.defaults,
    filtered: built.filtered,
    skipped: false,
    registered: false,
  };

  if (auto === 0) {
    log(
      formatProviderSummary({
        ...base,
        registered: false,
      }) + " (nothing to register)",
    );
    return base;
  }

  if (!force && shouldSkipByHash(registeredAutoHashes.get(providerName), built.autoHash)) {
    const summary = { ...base, skipped: true };
    log(formatProviderSummary(summary));
    return summary;
  }

  const existingRaw: any[] = modelsJson.providers[providerName]?.models ?? [];
  registerProviderModels(pi, providerName, providerCfg, existingRaw, built.models);
  registeredAutoHashes.set(providerName, built.autoHash);
  const summary = { ...base, registered: true };
  log(formatProviderSummary(summary));
  return summary;
}

/**
 * factory 同步：只用磁盘 cache，早于 session restore。
 */
function eagerRegisterFromCache(pi: ExtensionAPI): void {
  try {
    const resolved = resolveEnabledConfig();
    if (!resolved) return;

    const { config, modelsJson, providerNames } = resolved;
    lastEnabledProviders = providerNames;
    log(`Eager register from cache; providers: ${providerNames.join(", ")}`);

    let registry: FlatRegistry = new Map();
    const regCache = readRegistryCache();
    if (regCache?.data) {
      const key = regCache.etag || "disk";
      registry = getFlatRegistry(regCache.data, key);
      log(`  registry cache: ${registry.size} entries`);
    } else {
      log(`  registry cache missing; AUTO models use defaults until session_start`);
    }

    const summaries: ProviderRunSummary[] = [];
    for (const providerName of providerNames) {
      const providerCfg = extractProviderConfig(modelsJson, providerName);
      if (!providerCfg) continue;

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

      const built = buildAndFilterModels(newIds, registry, config.excludePatterns);
      summaries.push(tryRegisterProvider(pi, providerName, providerCfg, modelsJson, built, false));
    }

    if (summaries.length > 0) {
      lastSummaries = summaries;
      lastStatusText = formatStatusLine(summaries);
    }
  } catch (err) {
    log(`Eager register failed: ${err}`);
  }
}

type InitOptions = {
  force?: boolean;
  /** false 时过期 registry 同步拉网/用 stale，不再 schedule 后台（防 SWR 环） */
  allowSwr?: boolean;
  ctx?: ExtensionContext;
};

type InitResult = {
  ok: boolean;
  summaries: ProviderRunSummary[];
  error?: string;
};

async function discoverIds(
  providerName: string,
  providerCfg: ProviderConfig,
  force: boolean,
): Promise<{ ids: string[]; source: "fresh" | "stale" | "network" } | null> {
  const pt = Date.now();
  if (!force) {
    const freshCache = isProviderCacheFresh(providerName) ? readProviderCache(providerName) : null;
    if (freshCache && freshCache.modelIds.length > 0) {
      log(`  [${providerName}] cache hit (${freshCache.modelIds.length} models, ${Date.now() - pt}ms)`);
      return { ids: freshCache.modelIds, source: "fresh" };
    }
  }

  try {
    const ids = await fetchRemoteModels(providerCfg);
    writeProviderCache(providerName, {
      hash: hashModelIds(ids),
      modelIds: ids,
    });
    return { ids, source: "network" };
  } catch (err) {
    log(`  [${providerName}] ✗ unreachable: ${err}`);
    const cached = readProviderCache(providerName);
    if (!cached || cached.modelIds.length === 0) return null;
    log(`  [${providerName}] → fallback cache (${cached.modelIds.length} models)`);
    return { ids: cached.modelIds, source: "stale" };
  }
}

async function initModels(pi: ExtensionAPI, options: InitOptions = {}): Promise<InitResult> {
  const t0 = Date.now();
  const force = options.force ?? false;
  const allowSwr = options.allowSwr ?? true;
  const ctx = options.ctx;
  const summaries: ProviderRunSummary[] = [];
  lastInitError = null;

  try {
    const resolved = resolveEnabledConfig();
    if (!resolved) {
      lastEnabledProviders = [];
      ctx?.ui.setStatus(STATUS_KEY, undefined);
      return { ok: true, summaries };
    }

    const { config, modelsJson, providerNames } = resolved;
    lastEnabledProviders = providerNames;
    log(`Enabled providers: ${providerNames.join(", ")}${force ? " (force)" : ""}`);

    let t = Date.now();
    const { data: registryData, fromCache, stale, etag } = await loadRegistry({
      force,
      allowSwr,
      pi,
    });
    log(
      `  registry: ${Date.now() - t}ms (${fromCache ? "cached" : "fresh"}${stale ? ",stale" : ""})`,
    );
    t = Date.now();
    const registry = getFlatRegistry(registryData, etag || "live");
    log(`  flatten: ${Date.now() - t}ms, ${registry.size} entries`);

    const hadNoCache = providerNames.every((name) => !readProviderCache(name)?.modelIds?.length);

    const results = await Promise.all(
      providerNames.map(async (providerName) => {
        const providerCfg = extractProviderConfig(modelsJson, providerName);
        if (!providerCfg) return null;

        const discovered = await discoverIds(providerName, providerCfg, force);
        if (!discovered || discovered.ids.length === 0) {
          log(`  [${providerName}] ✗ 0 models`);
          return null;
        }

        const newIds = filterNewModelIds(discovered.ids, providerCfg.existingModels);
        if (newIds.length === 0) {
          log(`  [${providerName}] ✓ all ${discovered.ids.length} models already defined`);
          return null;
        }

        const built = buildAndFilterModels(newIds, registry, config.excludePatterns);
        return tryRegisterProvider(pi, providerName, providerCfg, modelsJson, built, force);
      }),
    );

    for (const r of results) {
      if (r) summaries.push(r);
    }

    lastSummaries = summaries;
    lastStatusText = formatStatusLine(summaries);
    if (ctx?.hasUI) {
      ctx.ui.setStatus(
        STATUS_KEY,
        lastStatusText === "dynamic-models: idle" ? undefined : lastStatusText,
      );

      const anyRegistered = summaries.some((s) => s.registered);
      if (hadNoCache && anyRegistered) {
        ctx.ui.notify(`dynamic-models: first discovery · ${lastStatusText}`, "info");
      } else if (anyRegistered) {
        const changed = summaries.filter((s) => s.registered);
        if (changed.length > 0 && !summaries.every((s) => s.skipped)) {
          ctx.ui.notify(`dynamic-models: ${formatStatusLine(changed)}`, "info");
        }
      }
    }

    log(`=== End (${Date.now() - t0}ms) ===`);
    return { ok: true, summaries };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    lastInitError = message;
    log(`Fatal error: ${err}`);
    if (err instanceof Error && err.stack) {
      for (const line of err.stack.split("\n")) log(`  ${line}`);
    }
    ctx?.ui.notify(`dynamic-models failed: ${message}`, "error");
    log(`=== End (${Date.now() - t0}ms) ===`);
    return { ok: false, summaries, error: message };
  }
}

function listProviderCacheNames(): string[] {
  try {
    if (!existsSync(PROVIDER_CACHE_DIR)) return [];
    return readdirSync(PROVIDER_CACHE_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

function registerCommands(pi: ExtensionAPI): void {
  pi.registerCommand("dynamic-models", {
    description: "动态模型：status（默认）或 refresh 强制刷新",
    handler: async (args, ctx) => {
      const sub = (args.trim().split(/\s+/)[0] || "status").toLowerCase();
      if (sub === "refresh" || sub === "r") {
        ctx.ui.notify("dynamic-models: refreshing…", "info");
        const result = await initModels(pi, { force: true, ctx });
        if (!result.ok) {
          // initModels 已 error notify；勿再报 nothing to do
          return;
        }
        const line = formatStatusLine(result.summaries);
        ctx.ui.notify(
          result.summaries.length === 0
            ? "dynamic-models: nothing to register"
            : `dynamic-models: ${line}`,
          "info",
        );
        return;
      }

      // status：解析当前 enable + 上次摘要 + cache
      const resolved = resolveEnabledConfig();
      const enabled =
        resolved?.providerNames ??
        (lastEnabledProviders.length ? lastEnabledProviders : []);
      const caches = listProviderCacheNames();
      const enabledSet = new Set(enabled);
      const activeCaches = caches.filter((c) => enabledSet.has(c));
      const staleCaches = caches.filter((c) => !enabledSet.has(c));
      const lines = [
        "dynamic-models status",
        `enabled: ${enabled.length ? enabled.join(", ") : "(none)"}`,
        lastStatusText,
        ...lastSummaries.map((s) => formatProviderSummary(s)),
        activeCaches.length
          ? `caches (enabled): ${activeCaches.join(", ")}`
          : "caches (enabled): none",
      ];
      if (staleCaches.length) {
        lines.push(`caches (other): ${staleCaches.join(", ")}`);
      }
      if (lastInitError) lines.push(`last error: ${lastInitError}`);
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}

export default function (pi: ExtensionAPI) {
  eagerRegisterFromCache(pi);
  registerCommands(pi);
  pi.on("session_start", (_event, ctx) => {
    void initModels(pi, { ctx }).catch((err) => log(`Unhandled: ${err}`));
  });
}
