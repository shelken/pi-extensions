/** factory 只读缓存；网络发现推迟到 session_start 或显式刷新。 */
import type { ExtensionAPI, ExtensionContext, ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import * as Value from "typebox/value";
import { getBuiltInModelDefs, getBuiltInModelIds } from "./builtin.ts";
import {
  modelsJsonSchema,
  decodeRegistryCache,
  decodeRegistryPayload,
  decodeRemoteModels,
  decodeProviderCache,
  pluginConfigSchema,
} from "./discovery.ts";
import type { DiscoveredModel, ModelsJson, PluginConfig, ProviderModelCache, RegistryCache } from "./discovery.ts";
import { filterByExcludePatterns, formatProviderSummary, formatStatusLine, inFailureCooldown, resolveEnableProviders } from "./logic.ts";
import type { ProviderRunSummary } from "./logic.ts";
import { flattenRegistry, lookupModel, toPiCost, toPiInput, toPiThinkingLevelMap } from "./matcher.ts";
import type { RegistryData, RegistryEntry } from "./matcher.ts";
import { collectExistingIds, mergeProviderModelList, normalizeModelsJsonModel } from "./merge.ts";
import type { ModelLike } from "./merge.ts";

type FlatRegistry = Map<string, RegistryEntry[]>;
type ProviderConfig = {
  baseUrl: string;
  /** 保留 models.json 原始 `$VAR` 引用，由宿主解析凭据。 */
  apiKey?: string;
  api?: Api;
  headers?: Record<string, string>;
  authHeader: boolean;
  compat?: Model<Api>["compat"];
  fingerprint: string;
  existingModels: Set<string>;
};
type Resolved = { config: PluginConfig; modelsJson: ModelsJson; providerNames: string[] };
type InitResult = { ok: boolean; summaries: ProviderRunSummary[] };
type RuntimeState = {
  hashes: Map<string, string>;
  summaries: ProviderRunSummary[];
  enabled: string[];
  status: string;
  error: string | null;
  inFlight?: Promise<InitResult>;
  registryRefresh?: Promise<void>;
};
type CacheFile = RegistryCache | ProviderModelCache;

const EXTENSION_NAME = "pi-dynamic-models";
const agentOverride = process.env.PI_CODING_AGENT_DIR;
const AGENT_DIR = agentOverride
  ? resolve(agentOverride.startsWith("~/") ? join(homedir(), agentOverride.slice(2)) : agentOverride)
  : join(homedir(), ".pi", "agent");
const MODELS_JSON_PATH = join(AGENT_DIR, "models.json");
const CACHE_DIR = join(AGENT_DIR, "cache");
const REGISTRY_CACHE_FILE = join(CACHE_DIR, "models-registry.json");
const PROVIDER_CACHE_DIR = join(CACHE_DIR, "provider-models");
const NETWORK_LOCK_FILE = join(CACHE_DIR, "dynamic-models.lock");
const LOG_FILE = join(AGENT_DIR, "logs", "pi-dynamic-models.log");
const REGISTRY_URL = "https://models.dev/api.json";
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const NETWORK_TIMEOUT_MS = 3_000;
const FAILURE_COOLDOWN_MS = 10 * 60 * 1000;
const LOCK_WAIT_TIMEOUT_MS = 2_000;
const LOCK_STALE_MS = 30_000;
const states = new WeakMap<ExtensionAPI, RuntimeState>();
let flatRegistryMemo: { key: string; map: FlatRegistry } | undefined;
let isDebug = false;

function log(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`;
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true });
    writeFileSync(LOG_FILE, `${line}\n`, { flag: "a" });
  } catch {}
  if (isDebug) console.warn(line);
}

/** 磁盘 JSON 是不可信输入：解析失败按缺失处理，调用方必须再过 schema。 */
function readDiskJson(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    log(`Could not read ${path}: ${error}`);
    return undefined;
  }
}

function writeDiskJson(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, value, "utf8");
    renameSync(temporary, path);
  } finally {
    try { unlinkSync(temporary); } catch {}
  }
}

function isFresh(path: string): boolean {
  const stat = statSync(path, { throwIfNoEntry: false });
  return stat !== undefined && Date.now() - stat.mtimeMs < CACHE_MAX_AGE_MS;
}

function providerCachePath(name: string): string {
  return join(PROVIDER_CACHE_DIR, `${encodeURIComponent(name)}.json`);
}

function readProviderCache(name: string, fingerprint: string): ProviderModelCache | undefined {
  const raw = readDiskJson(providerCachePath(name));
  const cached = raw === undefined ? undefined : decodeProviderCache(raw);
  return cached?.fingerprint === fingerprint ? cached : undefined;
}

function readRegistryCache(): RegistryCache | undefined {
  const raw = readDiskJson(REGISTRY_CACHE_FILE);
  return raw === undefined ? undefined : decodeRegistryCache(raw);
}

function markFailure(path: string, cached: CacheFile): void {
  const previous = statSync(path, { throwIfNoEntry: false });
  try {
    writeDiskJson(path, JSON.stringify({ ...cached, lastFailedUnix: Date.now() }));
    if (previous) utimesSync(path, previous.atime, previous.mtime);
  } catch (error) {
    log(`Could not persist failure cooldown: ${error}`);
  }
}

export function getConfigPaths(cwd: string, home = homedir()): string[] {
  const agentDir = agentOverride ? AGENT_DIR : join(home, ".pi", "agent");
  return [
    join(agentDir, "extensions", EXTENSION_NAME, "config.json"),
    join(cwd, ".pi", "extensions", EXTENSION_NAME, "config.json"),
  ];
}

function resolveEnabledConfig(): Resolved | undefined {
  const path = getConfigPaths(process.cwd()).reverse().find((candidate) => existsSync(candidate));
  if (!path) return undefined;
  const rawConfig = readDiskJson(path);
  if (rawConfig === undefined) return undefined;
  const parsedConfig = JSON.parse(rawConfig);
  if (!Value.Check(pluginConfigSchema, parsedConfig)) {
    log(`Invalid plugin configuration: ${path}`);
    return undefined;
  }
  const config = Value.Parse(pluginConfigSchema, parsedConfig);
  isDebug = config.debug ?? false;
  if (!config.enable) return undefined;
  const rawModels = readDiskJson(MODELS_JSON_PATH);
  if (rawModels === undefined) return undefined;
  const parsedModels = JSON.parse(rawModels);
  if (!Value.Check(modelsJsonSchema, parsedModels)) {
    log("models.json is missing or invalid");
    return undefined;
  }
  const modelsJson = Value.Parse(modelsJsonSchema, parsedModels);
  const available = Object.keys(modelsJson.providers).filter((name) => !!modelsJson.providers[name].baseUrl);
  return { config, modelsJson, providerNames: resolveEnableProviders(config.enableProviders, available) };
}

/** 解析 `$VAR` / `${VAR}` 引用；未设置的引用原样保留，不阻断启动。 */
function requestValue(value: string): string {
  return value.replace(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g, (match, braced, plain) => process.env[braced ?? plain] ?? match);
}

function extractProviderConfig(modelsJson: ModelsJson, name: string): ProviderConfig | undefined {
  const provider = modelsJson.providers[name];
  if (!provider?.baseUrl) return undefined;
  const baseUrl = requestValue(provider.baseUrl).replace(/\/+$/, "");
  // 指纹基于配置引用而非密钥值：换账户仍失效，磁盘不出现秘密。
  const fingerprint = createHash("sha256").update(JSON.stringify([
    baseUrl, provider.api, provider.apiKey, provider.authHeader,
    Object.entries(provider.headers ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  ])).digest("hex");
  return {
    baseUrl,
    apiKey: provider.apiKey,
    api: provider.api,
    headers: provider.headers,
    authHeader: provider.authHeader ?? provider.apiKey !== undefined,
    compat: provider.compat,
    fingerprint,
    existingModels: collectExistingIds((provider.models ?? []).map((model) => model.id), getBuiltInModelIds(name)),
  };
}

async function fetchRegistry(cached: RegistryCache | undefined): Promise<RegistryData> {
  const headers = new Headers({ Accept: "application/json" });
  if (cached?.etag) headers.set("If-None-Match", cached.etag);
  const response = await fetch(REGISTRY_URL, { headers, signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) });
  if (response.status === 304 && cached) {
    // 304 是成功验证，必须推进成功时间，避免每次启动都重新验证。
    writeDiskJson(REGISTRY_CACHE_FILE, JSON.stringify({ etag: cached.etag, data: cached.data }));
    return cached.data;
  }
  if (!response.ok) throw new Error(`Registry HTTP ${response.status}`);
  const data = decodeRegistryPayload(await response.json());
  const etag = response.headers.get("etag") ?? "";
  writeDiskJson(REGISTRY_CACHE_FILE, JSON.stringify({ etag, data }));
  return data;
}

async function loadRegistry(pi: ExtensionAPI, force: boolean): Promise<RegistryData> {
  const cached = readRegistryCache();
  const state = states.get(pi)!;
  if (!force && cached) {
    if (!isFresh(REGISTRY_CACHE_FILE) && !inFailureCooldown(cached.lastFailedUnix, Date.now(), FAILURE_COOLDOWN_MS) && !state.registryRefresh) {
      state.registryRefresh = (async () => {
        try {
          await fetchRegistry(cached);
          flatRegistryMemo = undefined;
          await initModels(pi, { refreshRegistry: false });
        } catch (error) {
          markFailure(REGISTRY_CACHE_FILE, cached);
          log(`Registry refresh failed: ${error}`);
        } finally {
          state.registryRefresh = undefined;
        }
      })();
    }
    return cached.data;
  }
  try {
    return await fetchRegistry(cached);
  } catch (error) {
    if (cached) markFailure(REGISTRY_CACHE_FILE, cached);
    log(`Optional registry unavailable: ${error}`);
    return cached?.data ?? {};
  }
}

function getFlatRegistry(data: RegistryData): FlatRegistry {
  const key = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  if (flatRegistryMemo?.key === key) return flatRegistryMemo.map;
  const map = flattenRegistry(data);
  flatRegistryMemo = { key, map };
  return map;
}

async function fetchModels(config: ProviderConfig): Promise<DiscoveredModel[]> {
  const headers = new Headers({ Accept: "application/json" });
  // authHeader 为 false 时凭据由 models.json headers 提供；引用未解析时不发送伪凭据。
  const key = config.apiKey ? requestValue(config.apiKey) : undefined;
  if (config.authHeader && key && !key.startsWith("$")) headers.set("Authorization", `Bearer ${key}`);
  for (const [name, value] of Object.entries(config.headers ?? {})) headers.set(name, requestValue(value));
  const endpoints = config.baseUrl.endsWith("/v1")
    ? [`${config.baseUrl}/models`]
    : [`${config.baseUrl}/models`, `${config.baseUrl}/v1/models`];
  const signal = AbortSignal.timeout(NETWORK_TIMEOUT_MS);
  return Promise.any(endpoints.map(async (url) => {
    const response = await fetch(url, { headers, signal });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return decodeRemoteModels(await response.text());
  }));
}

function buildAutoModel(remote: DiscoveredModel, registry: FlatRegistry, provider: string): ModelLike {
  const catalog = lookupModel(remote.id, registry, provider)?.model;
  const contextWindow = remote.contextWindow ?? (catalog?.limit?.context || 128_000);
  const reasoning = remote.reasoning ?? catalog?.reasoning ?? false;
  const maxTokens = remote.maxTokens ?? (catalog?.limit?.output || 16_384);
  const name = remote.name ?? catalog?.name ?? remote.id;
  return {
    id: remote.id,
    name: `${name} (AUTO)`,
    contextWindow,
    maxTokens,
    reasoning,
    thinkingLevelMap: reasoning ? remote.thinkingLevelMap ?? toPiThinkingLevelMap(catalog?.reasoning_options, undefined) : undefined,
    input: remote.input ?? toPiInput(catalog?.modalities?.input, catalog?.attachment),
    cost: toPiCost(catalog?.cost),
  };
}

/** provider 级 compat 与模型自身 compat 合并；宿主对扩展模型不会再补这一层。 */
function mergeCompat(base: Model<Api>["compat"], override: Model<Api>["compat"]): Model<Api>["compat"] {
  return { ...base, ...override };
}

/** 补齐宿主扩展模型定义要求必填的字段；额外协议字段原样透传。 */
function toProviderModels(models: ModelLike[]): ProviderModelConfig[] {
  return models.map((model) => ({
    ...model,
    id: model.id,
    name: model.name ?? model.id,
    reasoning: model.reasoning ?? false,
    input: model.input ?? ["text"],
    cost: model.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: model.contextWindow ?? 128_000,
    maxTokens: model.maxTokens ?? 16_384,
  }));
}

function registerProviderModels(pi: ExtensionAPI, name: string, config: ProviderConfig, manual: ModelLike[], auto: ModelLike[]): void {
  const models = mergeProviderModelList({
    builtIn: getBuiltInModelDefs(name),
    fromModelsJson: manual.map(normalizeModelsJsonModel),
    autoNew: auto,
  }).map((model) => config.compat ? { ...model, compat: mergeCompat(model.compat, config.compat) } : model);
  // models.json 的 modelOverrides 仍由宿主合成；此处只提供合并后的整表。
  const definitions = toProviderModels(models);
  pi.registerProvider(name, {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey ?? "none",
    api: config.api ?? "openai-completions",
    headers: config.headers,
    authHeader: config.authHeader,
    models: definitions,
  });
}

function registerDiscovered(pi: ExtensionAPI, resolved: Resolved, name: string, config: ProviderConfig, remote: DiscoveredModel[], registry: FlatRegistry): ProviderRunSummary {
  const state = states.get(pi)!;
  const eligible = remote.filter((model) => !config.existingModels.has(model.id));
  const { kept } = filterByExcludePatterns(eligible.map((model) => model.id), resolved.config.excludePatterns);
  const excludedCount = eligible.length - kept.length;
  const models = kept.flatMap((id) => {
    const remoteModel = eligible.find((model) => model.id === id);
    return remoteModel ? [buildAutoModel(remoteModel, registry, name)] : [];
  });
  const manual = resolved.modelsJson.providers[name]?.models ?? [];
  const hash = createHash("sha256").update(JSON.stringify([config.fingerprint, manual, models])).digest("hex");
  const previous = state.hashes.get(name);
  const matched = eligible.filter((model) => lookupModel(model.id, registry, name)).length;
  const summary: ProviderRunSummary = {
    provider: name, manual: config.existingModels.size, auto: models.length,
    matched, defaults: eligible.length - matched, filtered: excludedCount,
    skipped: previous === hash, registered: false,
  };
  if (previous !== hash && (models.length > 0 || previous !== undefined)) {
    registerProviderModels(pi, name, config, manual, models);
    state.hashes.set(name, hash);
    summary.registered = true;
  }
  return summary;
}

function eagerRegisterFromCache(pi: ExtensionAPI): void {
  const resolved = resolveEnabledConfig();
  if (!resolved) return;
  const state = states.get(pi)!;
  state.enabled = resolved.providerNames;
  const registry = getFlatRegistry(readRegistryCache()?.data ?? {});
  for (const name of resolved.providerNames) {
    try {
      const config = extractProviderConfig(resolved.modelsJson, name);
      if (!config) continue;
      const cached = readProviderCache(name, config.fingerprint);
      if (!cached) continue;
      state.summaries.push(registerDiscovered(pi, resolved, name, config, cached.models, registry));
    } catch (error) {
      log(`${name}: eager registration failed: ${error}`);
    }
  }
  state.status = `dynamic-models (cached): ${formatStatusLine(state.summaries)}`;
}

async function acquireNetworkLock(): Promise<() => void> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
  while (true) {
    try {
      const descriptor = openSync(NETWORK_LOCK_FILE, "wx");
      writeFileSync(descriptor, String(process.pid), "utf8");
      closeSync(descriptor);
      return () => { try { unlinkSync(NETWORK_LOCK_FILE); } catch {} };
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
        log(`Network lock unavailable: ${error}`);
        return () => {};
      }
      const stat = statSync(NETWORK_LOCK_FILE, { throwIfNoEntry: false });
      if (stat && Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
        try { unlinkSync(NETWORK_LOCK_FILE); } catch {}
        continue;
      }
      if (Date.now() >= deadline) return () => {};
      await sleep(50);
    }
  }
}

async function processProvider(pi: ExtensionAPI, resolved: Resolved, name: string, registry: FlatRegistry, force: boolean): Promise<ProviderRunSummary | undefined> {
  const config = extractProviderConfig(resolved.modelsJson, name);
  if (!config) return undefined;
  const cached = readProviderCache(name, config.fingerprint);
  let models = cached?.models;
  const stale = !cached || (!isFresh(providerCachePath(name)) && !inFailureCooldown(cached.lastFailedUnix, Date.now(), FAILURE_COOLDOWN_MS));
  if (force || stale) {
    try {
      models = await fetchModels(config);
      writeDiskJson(providerCachePath(name), JSON.stringify({ version: 2, fingerprint: config.fingerprint, models }));
    } catch (error) {
      if (cached) markFailure(providerCachePath(name), cached);
      if (!models) throw error;
      log(`${name}: model discovery failed, using stale cache`);
    }
  }
  return registerDiscovered(pi, resolved, name, config, models ?? [], registry);
}

async function initModels(pi: ExtensionAPI, options: { force?: boolean; refreshRegistry?: boolean; ctx?: ExtensionContext } = {}): Promise<InitResult> {
  const state = states.get(pi)!;
  if (state.inFlight) {
    const result = await state.inFlight;
    // 后台 registry 二次注册需要在新数据上跑一遍；普通并发读取复用结果。
    if (!options.force && options.refreshRegistry !== false) return result;
  }
  const task = (async (): Promise<InitResult> => {
    const resolved = resolveEnabledConfig();
    if (!resolved) return { ok: true, summaries: [] };
    state.enabled = resolved.providerNames;
    const release = await acquireNetworkLock();
    try {
      const data = options.refreshRegistry === false ? readRegistryCache()?.data ?? {} : await loadRegistry(pi, options.force ?? false);
      const registry = getFlatRegistry(data);
      const settled = await Promise.allSettled(resolved.providerNames.map((name) => processProvider(pi, resolved, name, registry, options.force ?? false)));
      const summaries: ProviderRunSummary[] = [];
      const errors: string[] = [];
      for (const [index, result] of settled.entries()) {
        if (result.status === "fulfilled") {
          if (result.value) summaries.push(result.value);
        } else {
          errors.push(`${resolved.providerNames[index]}: discovery failed`);
          log(`${resolved.providerNames[index]}: ${result.reason}`);
        }
      }
      state.summaries = summaries;
      state.status = `dynamic-models: ${formatStatusLine(summaries)}`;
      state.error = errors.length ? errors.join("; ") : null;
      log(state.status);
      for (const summary of summaries) log(formatProviderSummary(summary));
      // 只提示发生变化的 provider；纯缓存命中不打扰用户。
      const changed = summaries.filter((summary) => summary.registered);
      if (options.ctx?.hasUI && changed.length > 0) {
        options.ctx.ui.notify(`dynamic-models: ${formatStatusLine(changed)}`, "info");
      }
      if (state.error && options.ctx) options.ctx.ui.notify(`dynamic-models failed: ${state.error}`, "error");
      return { ok: errors.length === 0, summaries };
    } finally {
      release();
    }
  })();
  state.inFlight = task;
  try {
    return await task;
  } finally {
    if (state.inFlight === task) state.inFlight = undefined;
  }
}

/** 显式刷新入口：命令与测试共用，避免为 UI 上下文复制发现流程。 */
export async function refreshDiscovery(pi: ExtensionAPI, ctx?: ExtensionContext): Promise<InitResult> {
  return initModels(pi, { force: true, ctx });
}

function registerCommands(pi: ExtensionAPI): void {
  pi.registerCommand("dynamic-models", {
    description: "动态模型：status（默认）或 refresh 强制刷新",
    getArgumentCompletions: (prefix) => {
      const items = [
        { value: "status", label: "status", description: "查看启用与缓存状态（默认）" },
        { value: "refresh", label: "refresh", description: "强制刷新远端模型" },
      ].filter((item) => item.value.startsWith(prefix.trim().toLowerCase()));
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const sub = args.trim().split(/\s+/)[0].toLowerCase();
      if (sub === "refresh" || sub === "r") {
        ctx.ui.notify("dynamic-models: refreshing…", "info");
        try {
          const result = await refreshDiscovery(pi, ctx);
          if (result.ok) ctx.ui.notify(`dynamic-models: ${formatStatusLine(result.summaries)}`, "info");
        } catch (error) {
          ctx.ui.notify(`dynamic-models: refresh failed: ${error}`, "error");
        }
        return;
      }
      const state = states.get(pi)!;
      const caches = readdirSync(PROVIDER_CACHE_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => decodeURIComponent(entry.name.slice(0, -5)));
      const lines = [
        "dynamic-models status",
        `enabled: ${state.enabled.join(", ") || "(none)"}`,
        state.status,
        ...state.summaries.map(formatProviderSummary),
        `caches: ${caches.join(", ") || "none"}`,
        ...(state.error ? [`last error: ${state.error}`] : []),
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}

export default function dynamicModels(pi: ExtensionAPI): void {
  states.set(pi, { hashes: new Map(), summaries: [], enabled: [], status: "dynamic-models: idle", error: null });
  eagerRegisterFromCache(pi);
  registerCommands(pi);
  pi.on("session_start", (_event, ctx) => {
    setTimeout(() => {
      void initModels(pi, { ctx }).catch((error) => log(`Discovery failed: ${error}`));
    }, 0);
  });
}
