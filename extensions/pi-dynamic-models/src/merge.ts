/**
 * registerProvider(models) 会整表替换该 provider 的模型列表。
 * 合并时：内置参数优先保留 → models.json 同 id 覆盖内置 → 仅追加全新 AUTO id。
 */

export type ModelLike = {
  id: string;
  name?: string;
  api?: string;
  reasoning?: boolean;
  input?: ("text" | "image")[];
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow?: number;
  maxTokens?: number;
  baseUrl?: string;
  [key: string]: unknown;
};

/** models.json 手写 id ∪ 内置 id → 已存在，AUTO 不得覆盖其参数。 */
export function collectExistingIds(
  modelsJsonIds: Iterable<string>,
  builtInIds: Iterable<string>,
): Set<string> {
  const set = new Set<string>();
  for (const id of modelsJsonIds) set.add(id);
  for (const id of builtInIds) set.add(id);
  return set;
}

/**
 * 生成 registerProvider 用的完整 models 列表（替换语义下的「合并」）。
 * - builtIn：pi 内置目录
 * - fromModelsJson：用户 models.json（同 id 覆盖内置）
 * - autoNew：仅应包含不在 existing 里的 id；此处再防一层
 */
export function mergeProviderModelList(options: {
  builtIn: ModelLike[];
  fromModelsJson: ModelLike[];
  autoNew: ModelLike[];
}): ModelLike[] {
  const map = new Map<string, ModelLike>();

  for (const model of options.builtIn) {
    if (!model?.id) continue;
    map.set(model.id, model);
  }

  for (const model of options.fromModelsJson) {
    if (!model?.id) continue;
    // 用户手写优先于内置（与 pi models.json 合并语义一致）
    map.set(model.id, model);
  }

  for (const model of options.autoNew) {
    if (!model?.id) continue;
    if (map.has(model.id)) continue; // 永不覆盖已有 id 的参数
    map.set(model.id, model);
  }

  return [...map.values()];
}
