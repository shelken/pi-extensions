import { describe, expect, it } from "vitest";
import {
  filterByExcludePatterns,
  formatProviderSummary,
  formatStatusLine,
  inFailureCooldown,
  matchesExcludePattern,
  resolveEnableProviders,
} from "../src/logic.ts";

describe("failure cooldown", () => {
  const now = 1_000_000_000_000;
  const cooldown = 10 * 60 * 1000;

  it("no lastFailedUnix means no cooldown", () => {
    expect(inFailureCooldown(undefined, now, cooldown)).toBe(false);
  });

  it("failure within cooldown window blocks network", () => {
    expect(inFailureCooldown(now - 1_000, now, cooldown)).toBe(true);
    expect(inFailureCooldown(now - cooldown + 1, now, cooldown)).toBe(true);
  });

  it("failure outside cooldown window allows network", () => {
    expect(inFailureCooldown(now - cooldown, now, cooldown)).toBe(false);
    expect(inFailureCooldown(now - cooldown - 60_000, now, cooldown)).toBe(false);
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
