import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import type { ModelLike } from "../src/merge.ts";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Registration = Parameters<ExtensionAPI["registerProvider"]>[1];
type RemoteFixture = {
  id: string;
  display_name?: string;
  context_length?: number;
  context_window?: number;
  max_tokens?: number;
  max_output_tokens?: number;
  input?: string[];
  input_modalities?: string[];
  output_modalities?: string[];
  architecture?: { output_modalities: string[] };
  reasoning?: boolean;
  reasoning_levels?: Array<string | { effort: string }>;
  supported_reasoning_levels?: Array<string | { effort: string }>;
};

type ApiSubset = Pick<ExtensionAPI, "registerProvider" | "registerCommand" | "on">;

type ProviderFixture = {
  baseUrl: string;
  api: string;
  apiKey: string;
  models?: ModelLike[];
  headers?: Record<string, string>;
  authHeader?: boolean;
  compat?: ModelLike["compat"];
};

let root: string;
let agent: string;
let remote: RemoteFixture[];
let registryAvailable: boolean;
let calls: Array<{ url: string; headers: Headers }>;
let providerConfig: ProviderFixture;

/** ExtensionAPI 是 ApiSubset 的父类型，因此单次断言即可收敛。 */
function asApi(stub: ApiSubset): ExtensionAPI {
  // SAFETY: 桩实现被测扩展实际调用的三个方法；其余成员不会被访问。
  return stub as ExtensionAPI;
}

function writeModelsJson(): void {
  writeFileSync(join(agent, "models.json"), JSON.stringify({ providers: { mp: providerConfig } }));
}

async function start() {
  // 扩展按 PI_CODING_AGENT_DIR 定位配置；用临时目录替代真实 agent 目录。
  // 动态加载与 refreshDiscovery 取同一模块实例，确保共享进程内状态。
  const module = await import("../src/index.ts");
  const registrations = new Map<string, Registration>();
  // 扩展 factory 只依赖这三个方法；命令处理器单独由 refreshDiscovery 覆盖。
  const stub: ApiSubset = {
    registerProvider: (name: string, config: Registration) => registrations.set(name, config),
    registerCommand() {},
    on() {},
  };
  const api = asApi(stub);
  module.default(api);
  return {
    registrations,
    async refresh() {
      await module.refreshDiscovery(api);
    },
    target: () => registrations.get("mp")?.models?.find((model) => model.id === "alias/flash"),
    modelIds: () => registrations.get("mp")?.models?.map((model) => model.id),
  };
}

function modelAt(runtime: Awaited<ReturnType<typeof start>>, id: string): ProviderModelConfig | undefined {
  return runtime.registrations.get("mp")?.models?.find((model) => model.id === id);
}

beforeEach(() => {
  vi.resetModules();
  root = mkdtempSync(join(tmpdir(), "pi-discovery-"));
  agent = join(root, ".pi", "agent");
  mkdirSync(join(agent, "extensions", "pi-dynamic-models"), { recursive: true });
  writeFileSync(join(agent, "extensions", "pi-dynamic-models", "config.json"), JSON.stringify({ enable: true }));
  process.env.PI_CODING_AGENT_DIR = agent;
  providerConfig = { baseUrl: "https://gateway.example/v1", api: "openai-responses", apiKey: "test-key" };
  writeModelsJson();
  remote = [{ id: "alias/flash", context_length: 1000000, max_output_tokens: 32000, input_modalities: ["text", "image"], reasoning: true, reasoning_levels: ["low", "high", "max"] }];
  registryAvailable = true;
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers) });
    if (url === "https://models.dev/api.json") {
      if (!registryAvailable) throw new Error("registry offline");
      return Response.json({}, { headers: { etag: "catalog-v1" } });
    }
    return Response.json({ data: remote });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete process.env.PI_CODING_AGENT_DIR;
  rmSync(root, { recursive: true, force: true });
});

describe("discovery registration lifecycle", () => {
  it("uses gateway capabilities for an unknown alias and restores them without startup networking", async () => {
    const runtime = await start();
    expect(calls).toEqual([]);
    await runtime.refresh();
    expect(runtime.target()).toMatchObject({
      contextWindow: 1000000, maxTokens: 32000, reasoning: true, input: ["text", "image"],
      thinkingLevelMap: { low: "low", high: "high", max: "max" },
    });
    calls.length = 0;
    const restored = await start();
    expect(restored.target()).toMatchObject({ contextWindow: 1000000, maxTokens: 32000, input: ["text", "image"] });
    expect(calls).toEqual([]);
  });

  it("discovers gateway models when the optional registry is unavailable on first run", async () => {
    registryAvailable = false;
    const runtime = await start();
    await runtime.refresh();
    expect(runtime.target()?.contextWindow).toBe(1000000);
  });

  it("updates capabilities even when IDs do not change", async () => {
    const runtime = await start();
    await runtime.refresh();
    remote = [{ id: "alias/flash", context_window: 256000, max_tokens: 8000, input: ["text"], reasoning: false }];
    await runtime.refresh();
    expect(runtime.target()).toMatchObject({ contextWindow: 256000, maxTokens: 8000, reasoning: false, input: ["text"] });
    expect(runtime.target()?.thinkingLevelMap).toBeUndefined();
  });

  it("removes AUTO models on an authoritative empty list while preserving manual models", async () => {
    providerConfig.models = [{ id: "manual", contextWindow: 64000, maxTokens: 4000 }];
    writeModelsJson();
    const runtime = await start();
    await runtime.refresh();
    remote = [];
    await runtime.refresh();
    expect(runtime.modelIds()).toEqual(["manual"]);
    const restored = await start();
    expect(restored.target()).toBeUndefined();
    // 空 AUTO 列表不需要注册；手写模型由宿主按 models.json 直接合成。
    expect(restored.registrations.has("mp")).toBe(false);
  });

  it("does not reuse cache from a different endpoint or account", async () => {
    const runtime = await start();
    await runtime.refresh();
    providerConfig.baseUrl = "https://different.example/v1";
    providerConfig.apiKey = "different-account";
    writeModelsJson();
    const restored = await start();
    expect(restored.target()).toBeUndefined();
    await restored.refresh();
    expect(restored.target()?.contextWindow).toBe(1000000);
  });

  it("keeps provider-level compat on every registered model", async () => {
    providerConfig.compat = { sessionAffinityFormat: "openrouter" };
    writeModelsJson();
    const runtime = await start();
    await runtime.refresh();
    expect(runtime.target()?.compat).toEqual({ sessionAffinityFormat: "openrouter" });
    expect(modelAt(runtime, "manual")).toBeUndefined();
  });

  it("uses configured headers for discovery and preserves request authentication", async () => {
    vi.stubEnv("DISCOVERY_HEADER", "tenant-token");
    providerConfig.headers = { "X-Tenant": "$DISCOVERY_HEADER" };
    providerConfig.authHeader = false;
    writeModelsJson();
    const runtime = await start();
    await runtime.refresh();
    const request = calls.find((call) => call.url.includes("gateway.example"));
    expect(request?.headers.get("X-Tenant")).toBe("tenant-token");
    expect(request?.headers.has("Authorization")).toBe(false);
    expect(runtime.registrations.get("mp")).toMatchObject({ headers: { "X-Tenant": "$DISCOVERY_HEADER" }, authHeader: false });
  });

  it("accepts effort objects returned by the gateway's reasoning levels", async () => {
    remote = [{ id: "alias/flash", supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }] }];
    const runtime = await start();
    await runtime.refresh();
    expect(runtime.target()).toMatchObject({ reasoning: true, thinkingLevelMap: { low: "low", high: "high" } });
  });

  it("does not register non-chat models or let invalid numeric limits poison the provider", async () => {
    remote = [
      { id: "alias/flash", context_window: -1, max_output_tokens: 0 },
      { id: "embeddings", output_modalities: ["embedding"] },
      { id: "image-generation", architecture: { output_modalities: ["image"] } },
    ];
    const runtime = await start();
    await runtime.refresh();
    expect(runtime.modelIds()).toEqual(["alias/flash"]);
    expect(runtime.target()).toMatchObject({ contextWindow: 128000, maxTokens: 16384 });
  });

  it("preserves a successful cache when the server returns a malformed response", async () => {
    const runtime = await start();
    await runtime.refresh();
    const cachePath = join(agent, "cache", "provider-models", "mp.json");
    const cached = JSON.parse(readFileSync(cachePath, "utf8"));
    vi.stubGlobal("fetch", vi.fn(async (input: string) => String(input).includes("models.dev")
      ? Response.json({}, { headers: { etag: "catalog-v1" } })
      : Response.json({ error: "wrong endpoint" })));
    await runtime.refresh();
    expect(runtime.target()?.contextWindow).toBe(1000000);
    const after = JSON.parse(readFileSync(cachePath, "utf8"));
    expect(after.models).toEqual(cached.models);
  });
});
