/**
 * 读取 pi 内置 provider 模型目录。
 * 与 models.json 合并时：同 id 不覆盖内置/手写参数，只追加缺失 id。
 */

import { getModels, getProviders } from "@earendil-works/pi-ai/compat";
import type { ModelLike } from "./merge.ts";

export function isBuiltInProvider(providerName: string): boolean {
  try {
    // SAFETY: getProviders() 返回 KnownProvider[]（闭集字面量联合）；includes 需接受任意用户输入的 provider 名，放宽元素类型
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
    // SAFETY: getProviders() 返回 KnownProvider[]（闭集字面量联合）；includes 需接受任意用户输入的 provider 名，放宽元素类型
    if (!(getProviders() as string[]).includes(providerName)) return [];
    // SAFETY: KnownProvider 是闭集；上方 includes 已确认该名存在
    return getModels(providerName as never).map((model) => {
      // 不写死官方 baseUrl：register 时用 models.json / provider 级 baseUrl。
      const { baseUrl: _baseUrl, ...rest } = model;
      return {
        ...rest,
        id: model.id,
        name: model.name ?? model.id,
        reasoning: model.reasoning ?? false,
        contextWindow: model.contextWindow ?? 128_000,
        maxTokens: model.maxTokens ?? 16_384,
      };
    });
  } catch {
    return [];
  }
}
