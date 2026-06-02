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
  const url = `${cfg.baseUrl}/models`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

  log(`Fetching ${url} ...`);
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const body = (await res.json()) as { data?: Array<{ id: string }> };
  const ids = (body.data ?? []).map((model) => model.id);
  log(`  → ${ids.length} models returned`);
  return ids;
}

export default async function (pi: ExtensionAPI) {
  const t0 = Date.now();

  try {
    const config = loadConfig(process.cwd());
    if (!config) {
      log(`Config not found in standard extension config paths, skip`);
      return;
    }

    isDebug = config.debug ?? false;
    if (isDebug) log("Debug mode ON");
    if (!config.enable) {
      log("Disabled via config.enable = false");
      return;
    }
    if (!Array.isArray(config.enableProviders) || config.enableProviders.length === 0) {
      log("No enableProviders configured, skip");
      return;
    }

    log(`Enabled providers: ${config.enableProviders.join(", ")}`);
    let t = Date.now();

    const modelsJson = readModelsJson();
    if (!modelsJson?.providers) {
      log("models.json not found or invalid, skip");
      return;
    }
    log(`models.json providers: ${Object.keys(modelsJson.providers).join(", ")}`);

    log(`  step2_modelsjson: ${Date.now() - t}ms`);
    t = Date.now();
    const { data: registryData, fromCache } = await fetchRegistry();
    log(`  step3_registry: ${Date.now() - t}ms (${fromCache ? "cached" : "fresh"})`);
    t = Date.now();
    const registry = flattenRegistry(registryData);
    log(`  flatten: ${Date.now() - t}ms, ${registry.size} entries`);
    t = Date.now();

    for (const providerName of config.enableProviders) {
      const providerCfg = extractProviderConfig(modelsJson, providerName);
      if (!providerCfg) continue;

      let discoveredIds: string[];
      let modelsFromCache = false;
      try {
        discoveredIds = await fetchRemoteModels(providerCfg);
        writeProviderCache(providerName, {
          hash: hashModelIds(discoveredIds),
          modelIds: discoveredIds,
        });
      } catch (err) {
        log(`  ✗ unreachable: ${err}`);
        const cached = readProviderCache(providerName);
        if (!cached || cached.modelIds.length === 0) continue;
        discoveredIds = cached.modelIds;
        modelsFromCache = true;
        log(`  → using cached model list (${discoveredIds.length} models)`);
      }

      if (discoveredIds.length === 0) {
        log("  ✗ returned 0 models");
        continue;
      }

      const newIds = discoveredIds.filter((id) => !providerCfg.existingModels.has(id));
      if (newIds.length === 0) {
        log(`  ✓ all ${discoveredIds.length} models already defined, nothing to add`);
        continue;
      }

      log(`  ${providerCfg.existingModels.size} existing + ${newIds.length} new (${discoveredIds.length} total)`);

      let matchedCount = 0;
      const discoveredModels = newIds.map((id) => {
        const entry = lookupModel(id, registry);
        if (!entry) {
          log(`    + ${id} → (defaults, no registry match)`);
          return {
            id,
            name: `${id} (AUTO)`,
            reasoning: false,
            input: ["text"] as ("text" | "image")[],
            contextWindow: 128_000,
            maxTokens: 16_384,
          };
        }

        matchedCount++;
        const model = entry.model;
        const piModel = {
          id,
          name: `${model.name ?? id} (AUTO)`,
          reasoning: model.reasoning ?? false,
          input: toPiInput(model.modalities?.input, model.attachment),
          contextWindow: model.limit?.context ?? 128_000,
          maxTokens: model.limit?.output ?? 16_384,
        };
        log(
          `    + ${id} → [${entry.provider}] ctx:${piModel.contextWindow} reasoning:${piModel.reasoning} input:${piModel.input}`,
        );
        return piModel;
      });

      const existingRaw = modelsJson.providers[providerName]?.models ?? [];
      const allModels = [...existingRaw, ...discoveredModels];

      log(
        `  Registering provider "${providerName}" with ${allModels.length} models (${matchedCount} registry-matched, matching: ${Date.now() - t}ms)${modelsFromCache ? " (cached)" : ""}`,
      );

      pi.registerProvider(providerName, {
        baseUrl: providerCfg.baseUrl,
        apiKey: providerCfg.apiKey ?? "none",
        authHeader: !!providerCfg.apiKey,
        api: providerCfg.api ?? "openai-completions",
        models: allModels,
      });
    }
  } catch (err) {
    log(`Fatal error: ${err}`);
    if (err instanceof Error && err.stack) {
      for (const line of err.stack.split("\n")) log(`  ${line}`);
    }
  }

  log(`=== End (${Date.now() - t0}ms) ===`);
}
