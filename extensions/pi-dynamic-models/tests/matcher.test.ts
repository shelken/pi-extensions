import { describe, expect, it } from "vitest";
import { flattenRegistry, lookupModel, toPiCost } from "../src/matcher.ts";

function registry() {
  return flattenRegistry({
    poe: {
      models: {
        "google/gemini-3-flash": {
          id: "google/gemini-3-flash",
          name: "Gemini 3 Flash via Poe",
          reasoning: true,
          modalities: { input: ["text", "image"] },
          limit: { context: 1_048_576, output: 65_536 },
        },
        "openai/gpt-5.3-codex-spark": {
          id: "openai/gpt-5.3-codex-spark",
          name: "GPT 5.3 Codex Spark via Poe",
          reasoning: true,
          modalities: { input: ["text"] },
          limit: { context: 128_000, output: 16_384 },
        },
      },
    },
    opencode: {
      models: {
        "gemini-3-flash": {
          id: "gemini-3-flash",
          name: "Gemini 3 Flash",
          reasoning: true,
          modalities: { input: ["text", "image"] },
          limit: { context: 1_048_576, output: 65_536 },
        },
      },
    },
    openai: {
      models: {
        "gpt-5.3-codex-spark": {
          id: "gpt-5.3-codex-spark",
          name: "GPT 5.3 Codex Spark",
          reasoning: true,
          modalities: { input: ["text", "image"] },
          limit: { context: 128_000, output: 16_384 },
        },
      },
    },
    anthropic: {
      models: {
        "claude-opus-4-6": {
          id: "claude-opus-4-6",
          name: "Claude Opus 4.6",
          reasoning: true,
          modalities: { input: ["text", "image"] },
          limit: { context: 1_000_000, output: 64_000 },
        },
      },
    },
    "302ai": {
      models: {
        "claude-opus-4-6-thinking": {
          id: "claude-opus-4-6-thinking",
          name: "Claude Opus 4.6 Thinking via 302AI",
          reasoning: true,
          modalities: { input: ["text", "image"] },
          limit: { context: 1_000_000, output: 64_000 },
        },
      },
    },
    minimax: {
      models: {
        "MiniMax-M2.5": {
          id: "MiniMax-M2.5",
          name: "MiniMax M2.5",
          reasoning: true,
          modalities: { input: ["text"] },
          limit: { context: 204_800, output: 32_768 },
        },
      },
    },
    "nano-gpt": {
      models: {
        "minimax/minimax-m2.5": {
          id: "minimax/minimax-m2.5",
          name: "MiniMax M2.5 via Nano GPT",
          reasoning: true,
          modalities: { input: ["text"] },
          limit: { context: 204_800, output: 8_192 },
        },
      },
    },
    "novita-ai": {
      models: {
        "inclusionai/ring-2.6-1t": {
          id: "inclusionai/ring-2.6-1t",
          name: "Ring 2.6 1T via Novita",
          reasoning: true,
          modalities: { input: ["text"] },
          limit: { context: 262_144, output: 16_384 },
        },
      },
    },
    openrouter: {
      models: {
        "inclusionai/ring-2.6-1t": {
          id: "inclusionai/ring-2.6-1t",
          name: "Ring 2.6 1T via OpenRouter",
          reasoning: true,
          modalities: { input: ["text"] },
          limit: { context: 262_144, output: 16_384 },
        },
        "openai/gpt-oss-120b:free": {
          id: "openai/gpt-oss-120b:free",
          name: "GPT OSS 120B Free",
          reasoning: true,
          modalities: { input: ["text"] },
          limit: { context: 131_072, output: 16_384 },
        },
      },
    },
  });
}

describe("dynamic model matcher", () => {
  it("prefers a fully aligned registry entry over a routed alias", () => {
    const entry = lookupModel("gemini-3-flash", registry());
    expect(entry?.provider).toBe("opencode");
    expect(entry?.sourceKey).toBe("gemini-3-flash");
  });

  it("strips route prefixes before applying model-family provider preference", () => {
    const entry = lookupModel("plus/gpt-5.3-codex-spark", registry());
    expect(entry?.provider).toBe("openai");
    expect(entry?.sourceKey).toBe("gpt-5.3-codex-spark");
  });

  it("strips model suffixes before allowing third-party exact aliases to win", () => {
    const entry = lookupModel("claude-opus-4-6-thinking", registry());
    expect(entry?.provider).toBe("anthropic");
    expect(entry?.sourceKey).toBe("claude-opus-4-6");
  });

  it("matches case-insensitive official provider entries after route and price tag normalization", () => {
    const entry = lookupModel("minimax/minimax-m2.5:free", registry());
    expect(entry?.provider).toBe("minimax");
    expect(entry?.sourceKey).toBe("MiniMax-M2.5");
  });

  it("uses price tags as route hints only when no model-family provider preference wins", () => {
    const entry = lookupModel("inclusionai/ring-2.6-1t:free", registry());
    expect(entry?.provider).toBe("openrouter");
    expect(entry?.sourceKey).toBe("inclusionai/ring-2.6-1t");
  });

  it("keeps model-family provider preference ahead of price route hints", () => {
    const entry = lookupModel("openai/gpt-oss-120b:free", registry());
    expect(entry?.provider).toBe("openrouter");
    expect(entry?.sourceKey).toBe("openai/gpt-oss-120b:free");
  });

  it("maps registry cost fields to pi cost fields", () => {
    expect(toPiCost({ input: 5, output: 30, cache_read: 0.5 })).toEqual({
      input: 5,
      output: 30,
      cacheRead: 0.5,
      cacheWrite: 0,
    });
  });

  it("uses zero cost when registry cost is absent", () => {
    expect(toPiCost()).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });
});
