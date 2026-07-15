import { describe, expect, it } from "vitest";
import {
  filterByExcludePatterns,
  filterNewModelIds,
  formatProviderSummary,
  formatStatusLine,
  hashModelIds,
  isUsableChatModel,
  matchesExcludePattern,
  resolveEnableProviders,
  shouldSkipByHash,
} from "../src/logic.ts";

describe("hashModelIds / shouldSkipByHash", () => {
  it("is order-independent", () => {
    expect(hashModelIds(["b", "a"])).toBe(hashModelIds(["a", "b"]));
  });

  it("skips only when previous hash equals next", () => {
    const h = hashModelIds(["grok-4.5"]);
    expect(shouldSkipByHash(undefined, h)).toBe(false);
    expect(shouldSkipByHash(h, h)).toBe(true);
    expect(shouldSkipByHash(h, hashModelIds(["other"]))).toBe(false);
  });
});

describe("filterNewModelIds", () => {
  it("keeps only ids missing from models.json", () => {
    expect(
      filterNewModelIds(
        ["grok-4.5", "plus/gpt-5.5", "claude-sonnet-4-6"],
        new Set(["plus/gpt-5.5"]),
      ),
    ).toEqual(["grok-4.5", "claude-sonnet-4-6"]);
  });
});

describe("resolveEnableProviders", () => {
  const available = ["cpa", "openai", "local"];

  it("expands omit and * to all available", () => {
    expect(resolveEnableProviders(undefined, available)).toEqual(available);
    expect(resolveEnableProviders("*", available)).toEqual(available);
    expect(resolveEnableProviders(["*"], available)).toEqual(available);
  });

  it("keeps explicit list and empty list", () => {
    expect(resolveEnableProviders(["cpa"], available)).toEqual(["cpa"]);
    expect(resolveEnableProviders([], available)).toEqual([]);
  });
});

describe("exclude patterns", () => {
  it("matches glob patterns case-insensitively", () => {
    expect(matchesExcludePattern("gpt-image-1", "gpt-image-*")).toBe(true);
    expect(matchesExcludePattern("Grok-Imagine-1", "grok-imagine-*")).toBe(true);
    expect(matchesExcludePattern("grok-4.5", "gpt-image-*")).toBe(false);
  });

  it("filters ids by patterns", () => {
    const { kept, excluded } = filterByExcludePatterns(
      ["grok-4.5", "gpt-image-1", "sora-2"],
      ["gpt-image-*", "sora-*"],
    );
    expect(kept).toEqual(["grok-4.5"]);
    expect(excluded).toEqual(["gpt-image-1", "sora-2"]);
  });
});

describe("isUsableChatModel", () => {
  it("rejects zero context window", () => {
    expect(isUsableChatModel({ contextWindow: 0 })).toBe(false);
    expect(isUsableChatModel({ contextWindow: 128_000 })).toBe(true);
  });
});

describe("summaries", () => {
  it("formats skipped and registered lines", () => {
    expect(
      formatProviderSummary({
        provider: "cpa",
        manual: 4,
        auto: 47,
        matched: 41,
        defaults: 6,
        filtered: 3,
        skipped: true,
        registered: false,
      }),
    ).toBe("cpa: 4 manual + 47 auto, unchanged");

    expect(
      formatProviderSummary({
        provider: "cpa",
        manual: 4,
        auto: 47,
        matched: 41,
        defaults: 6,
        filtered: 3,
        skipped: false,
        registered: true,
      }),
    ).toBe("cpa: 4 manual + 47 auto, 41 matched, 6 default, filtered=3, registered");
  });

  it("builds compact status line", () => {
    expect(
      formatStatusLine([
        {
          provider: "cpa",
          manual: 4,
          auto: 47,
          matched: 41,
          defaults: 6,
          filtered: 0,
          skipped: false,
          registered: true,
        },
        {
          provider: "x",
          manual: 1,
          auto: 2,
          matched: 2,
          defaults: 0,
          filtered: 0,
          skipped: true,
          registered: false,
        },
      ]),
    ).toBe("cpa +47 · x ok");
  });
});
