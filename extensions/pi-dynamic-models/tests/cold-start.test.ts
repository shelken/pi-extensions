import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

// 动态 import 不可避免：index.ts 在模块加载时读取 PI_CODING_AGENT_DIR，
// 必须先建临时目录并设置环境变量，再加载被测模块；vi.hoisted 先于静态 import 执行。
const agentDir = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join: joinPath } = await import("node:path");
  const dir = mkdtempSync(joinPath(tmpdir(), "pi-dynamic-models-cold-"));
  process.env.PI_CODING_AGENT_DIR = dir;
  return dir;
});
const { default: dynamicModels } = await import("../src/index.ts");

interface Gateway {
  server: Server;
  baseUrl: string;
  requests: number;
  status: number;
}

async function startGateway(): Promise<Gateway> {
  const { promise, resolve } = Promise.withResolvers<Gateway>();
  const gateway = { requests: 0, status: 200 } as Gateway;
  gateway.server = createServer((_request, response) => {
    gateway.requests += 1;
    response.statusCode = gateway.status;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ data: [{ id: "alpha" }, { id: "beta" }] }));
  });
  gateway.server.listen(0, "127.0.0.1", () => {
    const address = gateway.server.address();
    if (address === null || typeof address === "string") throw new Error("gateway has no port");
    gateway.baseUrl = `http://127.0.0.1:${address.port}/v1`;
    resolve(gateway);
  });
  return promise;
}

function stubApi(): { api: ExtensionAPI; registerProvider: Mock } {
  const registerProvider = vi.fn();
  // SAFETY: 测试桩只实现被测路径调用的方法（on/registerProvider/registerCommand）
  const api = { on: vi.fn(), registerProvider, registerCommand: vi.fn() } as unknown as ExtensionAPI;
  return { api, registerProvider };
}

function registeredIds(registerProvider: Mock, provider: string): string[] {
  const call = registerProvider.mock.calls.find(([name]) => name === provider);
  return call ? (call[1].models as { id: string }[]).map((model) => model.id) : [];
}

describe("pi-dynamic-models cold start", () => {
  let gateway: Gateway;

  beforeAll(async () => {
    gateway = await startGateway();
  });
  afterAll(() => {
    gateway.server.close();
    rmSync(agentDir, { recursive: true, force: true });
  });
  beforeEach(() => {
    rmSync(join(agentDir, "cache"), { recursive: true, force: true });
    gateway.requests = 0;
    gateway.status = 200;
    mkdirSync(join(agentDir, "extensions", "pi-dynamic-models"), { recursive: true });
    writeFileSync(join(agentDir, "extensions", "pi-dynamic-models", "config.json"), JSON.stringify({ enable: true }));
    writeFileSync(
      join(agentDir, "models.json"),
      JSON.stringify({ providers: { gw: { baseUrl: gateway.baseUrl, api: "openai-completions", apiKey: "literal-key" } } }),
    );
  });

  it("registers discovered models before the factory resolves when there is no cache", async () => {
    const { api, registerProvider } = stubApi();

    await dynamicModels(api);

    expect(registeredIds(registerProvider, "gw")).toEqual(expect.arrayContaining(["alpha", "beta"]));
    expect(existsSync(join(agentDir, "cache", "provider-models", "gw.json"))).toBe(true);
  });

  it("never touches the network when a cache exists", async () => {
    await dynamicModels(stubApi().api);
    gateway.requests = 0;
    const { api, registerProvider } = stubApi();

    await dynamicModels(api);

    expect(gateway.requests).toBe(0);
    expect(registeredIds(registerProvider, "gw")).toEqual(expect.arrayContaining(["alpha", "beta"]));
  });

  it("resolves without models and stops retrying during the cooldown when the gateway fails", async () => {
    gateway.status = 500;
    const first = stubApi();

    await expect(dynamicModels(first.api)).resolves.toBeUndefined();

    expect(registeredIds(first.registerProvider, "gw")).toEqual([]);
    const requestsAfterFailure = gateway.requests;
    expect(requestsAfterFailure).toBeGreaterThan(0);

    await dynamicModels(stubApi().api);

    expect(gateway.requests).toBe(requestsAfterFailure);
  });
});
