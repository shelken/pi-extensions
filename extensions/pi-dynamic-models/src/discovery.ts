import type { Api, Model } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { Static } from "typebox";
import * as Value from "typebox/value";
import type { ModelLike } from "./merge.ts";
import type { RegistryData, RegistryProvider } from "./matcher.ts";

const stringMap = Type.Record(Type.String(), Type.String());
export const pluginConfigSchema = Type.Object({
  enable: Type.Boolean(),
  enableProviders: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
  excludePatterns: Type.Optional(Type.Array(Type.String())),
  debug: Type.Optional(Type.Boolean()),
});
// 协议字段直接引用宿主类型，避免扩展维护一份平行字段表。
const apiSchema = Type.Unsafe<Api>({ type: "string" });
const compatSchema = Type.Unsafe<Model<Api>["compat"]>({ type: "object", additionalProperties: true });
export const modelsJsonSchema = Type.Object({
  providers: Type.Record(Type.String(), Type.Object({
    baseUrl: Type.Optional(Type.String()),
    apiKey: Type.Optional(Type.String()),
    api: Type.Optional(apiSchema),
    headers: Type.Optional(stringMap),
    authHeader: Type.Optional(Type.Boolean()),
    compat: Type.Optional(compatSchema),
    models: Type.Optional(Type.Array(Type.Object({ id: Type.String({ minLength: 1 }) }, { additionalProperties: true }))),
  }, { additionalProperties: true })),
});
export type PluginConfig = Static<typeof pluginConfigSchema>;
export type ModelsJson = Static<typeof modelsJsonSchema>;

const registryModelSchema = Type.Object({
  id: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  reasoning: Type.Optional(Type.Boolean()),
  attachment: Type.Optional(Type.Boolean()),
  modalities: Type.Optional(Type.Object({ input: Type.Optional(Type.Array(Type.String())), output: Type.Optional(Type.Array(Type.String())) })),
  limit: Type.Optional(Type.Object({ context: Type.Optional(Type.Number()), output: Type.Optional(Type.Number()) })),
  cost: Type.Optional(Type.Object({ input: Type.Optional(Type.Number()), output: Type.Optional(Type.Number()), cache_read: Type.Optional(Type.Number()), cache_write: Type.Optional(Type.Number()) })),
  // 真实目录存在非字符串档位；宽松接收，消费前统一转字符串。
  reasoning_options: Type.Optional(Type.Array(Type.Object({ type: Type.Optional(Type.String()), values: Type.Optional(Type.Array(Type.Unknown())) }))),
});
export const registryDataSchema = Type.Record(Type.String(), Type.Object({
  models: Type.Optional(Type.Record(Type.String(), registryModelSchema)),
}));
export type RegistryPayload = Static<typeof registryDataSchema>;
export const registryCacheSchema = Type.Object({
  etag: Type.String(),
  data: registryDataSchema,
  lastFailedUnix: Type.Optional(Type.Number()),
});
export type RegistryCache = { etag: string; data: RegistryData; lastFailedUnix?: number };

/** 归一化目录：补齐缺失 id，并把档位脏值转成消费端约定的字符串。 */
export function normalizeRegistry(data: RegistryPayload): RegistryData {
  const result: RegistryData = {};
  for (const [provider, entry] of Object.entries(data)) {
    if (!entry.models) continue;
    const models: RegistryProvider["models"] = {};
    for (const [key, model] of Object.entries(entry.models)) {
      models[key] = {
        ...model,
        id: model.id ?? key,
        reasoning_options: model.reasoning_options?.map((option) => ({
          type: option.type,
          values: option.values?.map((value) => String(value)),
        })),
      };
    }
    result[provider] = { models };
  }
  return result;
}

/** 目录响应是不可信输入，先整体校验再归一化。 */
export function decodeRegistryPayload(payload: string): RegistryData {
  return normalizeRegistry(Value.Parse(registryDataSchema, JSON.parse(payload)));
}

export function decodeRegistryCache(raw: string): RegistryCache | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!Value.Check(registryCacheSchema, parsed)) return undefined;
  const cache = Value.Parse(registryCacheSchema, parsed);
  return { etag: cache.etag, data: normalizeRegistry(cache.data), lastFailedUnix: cache.lastFailedUnix };
}

const effortSchema = Type.Union([Type.String(), Type.Object({ effort: Type.String() })]);

function levelNames(values?: Array<string | { effort: string }>): string[] | undefined {
  if (!values?.length) return undefined;
  const names = values.flatMap((value) => Value.Check(Type.String(), value)
    ? [Value.Parse(Type.String(), value).toLowerCase()]
    : [Value.Parse(Type.Object({ effort: Type.String() }), value).effort.toLowerCase()]);
  return names.length > 0 ? names : undefined;
}

const remoteRowSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  name: Type.Optional(Type.String()),
  display_name: Type.Optional(Type.String()),
  contextWindow: Type.Optional(Type.Number()),
  context_length: Type.Optional(Type.Number()),
  context_window: Type.Optional(Type.Number()),
  max_input_tokens: Type.Optional(Type.Number()),
  maxTokens: Type.Optional(Type.Number()),
  max_tokens: Type.Optional(Type.Number()),
  max_output_tokens: Type.Optional(Type.Number()),
  limits: Type.Optional(Type.Object({
    context: Type.Optional(Type.Number()),
    context_window: Type.Optional(Type.Number()),
    max_input_tokens: Type.Optional(Type.Number()),
    max_output_tokens: Type.Optional(Type.Number()),
  })),
  modalities: Type.Optional(Type.Object({
    input: Type.Optional(Type.Array(Type.String())),
    output: Type.Optional(Type.Array(Type.String())),
  })),
  architecture: Type.Optional(Type.Object({
    input_modalities: Type.Optional(Type.Array(Type.String())),
    output_modalities: Type.Optional(Type.Array(Type.String())),
  })),
  input: Type.Optional(Type.Array(Type.String())),
  input_modalities: Type.Optional(Type.Array(Type.String())),
  output: Type.Optional(Type.Array(Type.String())),
  output_modalities: Type.Optional(Type.Array(Type.String())),
  reasoning: Type.Optional(Type.Boolean()),
  supports_reasoning: Type.Optional(Type.Boolean()),
  reasoning_levels: Type.Optional(Type.Array(effortSchema)),
  supported_reasoning_levels: Type.Optional(Type.Array(effortSchema)),
});
type RemoteRow = Static<typeof remoteRowSchema>;
const idOnlySchema = Type.Object({ id: Type.String({ minLength: 1 }) });
type ListedRow = RemoteRow | Static<typeof idOnlySchema>;

const thinkingMapSchema = Type.Object({
  off: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  minimal: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  low: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  medium: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  high: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  xhigh: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  max: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});
const discoveredModelSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  name: Type.Optional(Type.String()),
  contextWindow: Type.Optional(Type.Integer({ minimum: 1 })),
  maxTokens: Type.Optional(Type.Integer({ minimum: 1 })),
  reasoning: Type.Optional(Type.Boolean()),
  thinkingLevelMap: Type.Optional(thinkingMapSchema),
  input: Type.Optional(Type.Array(Type.Union([Type.Literal("text"), Type.Literal("image")]))),
});
export type DiscoveredModel = Static<typeof discoveredModelSchema>;
export const providerCacheSchema = Type.Object({
  version: Type.Literal(2),
  fingerprint: Type.String(),
  models: Type.Array(discoveredModelSchema),
  lastFailedUnix: Type.Optional(Type.Number()),
});
export type ProviderModelCache = Static<typeof providerCacheSchema>;

function positiveInteger(...values: Array<number | undefined>): number | undefined {
  for (const value of values) {
    if (value !== undefined && Number.isSafeInteger(value) && value > 0) return value;
  }
  return undefined;
}

function thinkingMap(levels: string[]): ModelLike["thinkingLevelMap"] {
  const map: NonNullable<ModelLike["thinkingLevelMap"]> = {};
  for (const level of levels) {
    if (level === "minimal" || level === "low" || level === "medium" || level === "high" || level === "xhigh" || level === "max") map[level] = level;
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

function toDiscovered(row: RemoteRow): DiscoveredModel | undefined {
  const output = row.output_modalities ?? row.output ?? row.architecture?.output_modalities ?? row.modalities?.output;
  const inputKinds = row.input_modalities ?? row.input ?? row.architecture?.input_modalities ?? row.modalities?.input;
  const input = inputKinds?.filter((kind): kind is "text" | "image" => kind === "text" || kind === "image");
  const levels = levelNames(row.reasoning_levels ?? row.supported_reasoning_levels);
  const reasoning = row.reasoning ?? row.supports_reasoning ?? (levels?.length ? true : undefined);
  // 非对话输出（图片、向量）无法在该 provider 的 chat 端点上使用。
  if (output?.length && !output.includes("text")) return undefined;
  const model: DiscoveredModel = { id: row.id };
  const name = row.display_name ?? row.name;
  if (name) model.name = name;
  const contextWindow = positiveInteger(row.contextWindow, row.context_length, row.context_window, row.max_input_tokens, row.limits?.context_window, row.limits?.max_input_tokens, row.limits?.context);
  if (contextWindow) model.contextWindow = contextWindow;
  const maxTokens = positiveInteger(row.maxTokens, row.max_output_tokens, row.max_tokens, row.limits?.max_output_tokens);
  if (maxTokens) model.maxTokens = maxTokens;
  if (reasoning !== undefined) model.reasoning = reasoning;
  if (reasoning) {
    const map = thinkingMap(levels ?? []);
    if (map) model.thinkingLevelMap = map;
  }
  if (input?.length) model.input = input;
  return model;
}

/**
 * 远端模型列表：整体结构不合法才算失败；单行缺 id 跳过，
 * 字段类型异常时退化为只有 id 的模型，避免整批消失。
 */
export function decodeRemoteModels(raw: string): DiscoveredModel[] {
  const body: unknown = JSON.parse(raw);
  if (!Value.Check(remoteRowListSchema, body)) throw new Error("Model list response has no data/models array");
  const listed = rowsOf(Value.Parse(remoteRowListSchema, body));
  const models = new Map<string, DiscoveredModel>();
  for (const row of listed) {
    const discovered = Value.Check(remoteRowSchema, row) ? toDiscovered(Value.Parse(remoteRowSchema, row)) : { id: row.id };
    if (discovered) models.set(row.id, discovered);
  }
  return [...models.values()];
}

/** 裸数组或 { data } / { models } 包装；空数组是合法的“无模型”权威结果。 */
const remoteRowListSchema = Type.Union([
  Type.Array(Type.Union([remoteRowSchema, idOnlySchema])),
  Type.Object({ data: Type.Array(Type.Union([remoteRowSchema, idOnlySchema])) }),
  Type.Object({ models: Type.Array(Type.Union([remoteRowSchema, idOnlySchema])) }),
]);

function rowsOf(payload: Static<typeof remoteRowListSchema>): ListedRow[] {
  if (Array.isArray(payload)) return payload;
  return "data" in payload ? payload.data : payload.models;
}

export function decodeProviderCache(raw: string): ProviderModelCache | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return Value.Check(providerCacheSchema, parsed) ? Value.Parse(providerCacheSchema, parsed) : undefined;
}
