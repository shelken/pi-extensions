/**
 * 读取 pi 内置 provider 模型目录。
 * 与 models.json 合并时：同 id 不覆盖内置/手写参数，只追加缺失 id。
 */

import { getModels, getProviders } from "@earendil-works/pi-ai/compat";
import type { ModelLike } from "./merge.ts";

export function isBuiltInProvider(providerName: string): boolean {
  try {
    return (getProviders() as string[]).includes(providerName);
  } catch {
    return false;
  }
}

export function getBuiltInModelIds(providerName: string): string[] {
  return getBuiltInModelDefs(providerName).map((m) => m.id);
}

/** 转为 registerProvider 可用的模型定义（保留内置参数，不注入 AUTO 后缀）。 */
export function getBuiltInModelDefs(providerName: string): ModelLike[] {
  try {
    if (!(getProviders() as string[]).includes(providerName)) return [];
    // KnownProvider 是闭集；动态名用断言读取目录
    return getModels(providerName as never).map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      api: m.api,
      reasoning: m.reasoning ?? false,
      input: (m.input ?? ["text"]) as ("text" | "image")[],
      cost: m.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow ?? 128_000,
      maxTokens: m.maxTokens ?? 16_384,
      // 不写死官方 baseUrl：register 时用 models.json / provider 级 baseUrl
    }));
  } catch {
    return [];
  }
}
