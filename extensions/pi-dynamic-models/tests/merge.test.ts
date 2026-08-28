import { describe, expect, it } from "vitest";
import {
  collectExistingIds,
  mergeProviderModelList,
  normalizeModelsJsonModel,
} from "../src/merge.ts";

describe("normalizeModelsJsonModel", () => {
  it("fills pi modelFromJson defaults for omitted fields", () => {
    expect(normalizeModelsJsonModel({ id: "minimal" })).toEqual({
      id: "minimal",
      name: "minimal",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 16_384,
    });
  });

  it("keeps explicit fields and pass-through extra fields", () => {
    const model = normalizeModelsJsonModel({
      id: "rich",
      name: "Rich",
      reasoning: true,
      contextWindow: 256_000,
      // 透传字段不在 ModelLike 类型内（models.json 允许任意自定义字段），运行时 spread 保留
      extra: { anything: true },
    });
    expect(model).toMatchObject({
      id: "rich",
      name: "Rich",
      reasoning: true,
      contextWindow: 256_000,
      maxTokens: 16_384,
    });
    expect(Object.keys(model)).toContain("extra");
  });
});

describe("collectExistingIds", () => {
  it("unions models.json and built-in ids", () => {
    expect(
      collectExistingIds(["custom-a", "gpt-4"], ["gpt-4", "gpt-4o"]),
    ).toEqual(new Set(["custom-a", "gpt-4", "gpt-4o"]));
  });
});

describe("mergeProviderModelList", () => {
  it("keeps built-in params when auto has same id", () => {
    const merged = mergeProviderModelList({
      builtIn: [
        {
          id: "gpt-4",
          name: "GPT-4",
          contextWindow: 8192,
          maxTokens: 8192,
        },
      ],
      fromModelsJson: [],
      autoNew: [
        {
          id: "gpt-4",
          name: "gpt-4 (AUTO)",
          contextWindow: 128_000,
          maxTokens: 16_384,
        },
        {
          id: "brand-new",
          name: "brand-new (AUTO)",
          contextWindow: 128_000,
        },
      ],
    });

    expect(merged.map((m) => m.id)).toEqual(["gpt-4", "brand-new"]);
    expect(merged[0]).toMatchObject({
      id: "gpt-4",
      name: "GPT-4",
      contextWindow: 8192,
    });
    expect(merged[1].name).toBe("brand-new (AUTO)");
  });

  it("models.json overrides built-in same id, auto still cannot override", () => {
    const merged = mergeProviderModelList({
      builtIn: [{ id: "gpt-4", name: "GPT-4", contextWindow: 8192 }],
      fromModelsJson: [{ id: "gpt-4", name: "GPT-4 (proxy)", contextWindow: 200_000 }],
      autoNew: [{ id: "gpt-4", name: "gpt-4 (AUTO)", contextWindow: 1 }],
    });

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      name: "GPT-4 (proxy)",
      contextWindow: 200_000,
    });
  });
});
