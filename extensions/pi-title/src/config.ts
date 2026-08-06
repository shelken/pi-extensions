import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface TitleConfig {
	enabled: boolean;
	roundInterval: number;
	customPrompt: string;
	overrideManual: boolean;
	maxTitleLength: number;
	/** Minimum previous-round cache hit rate (0-1) required to trigger a title. */
	cacheThreshold: number;
	/** Title request hit rate below this (0-1) triggers a low-cache warn. */
	warnThreshold: number;
}

export const DEFAULT_PROMPT =
	"基于本次对话的最新内容，为这段对话起一个简洁标题。不超过 {maxTitleLength} 个字。直接输出标题文本，不要任何前缀、引号或标点包裹，不要调用任何工具。";

export const DEFAULT_CONFIG: TitleConfig = {
	enabled: true,
	roundInterval: 3,
	customPrompt: DEFAULT_PROMPT,
	overrideManual: false,
	maxTitleLength: 20,
	cacheThreshold: 0.5,
	warnThreshold: 0.95,
};

export type ConfigLayer = Partial<Record<keyof TitleConfig, unknown>>;

/**
 * Overlay config layers low→high priority. A field is accepted only if it has the
 * right type/shape; invalid fields fall through to the lower layer or default.
 * This keeps a malformed config file from crashing the gate (e.g. a string
 * roundInterval would break the modulo check).
 */
export function mergeConfig(layers: Array<ConfigLayer | undefined>): TitleConfig {
	const result: TitleConfig = { ...DEFAULT_CONFIG };
	for (const layer of layers) {
		if (!layer) continue;
		if (typeof layer.enabled === "boolean") result.enabled = layer.enabled;
		if (
			typeof layer.roundInterval === "number" &&
			Number.isInteger(layer.roundInterval) &&
			layer.roundInterval > 0
		) {
			result.roundInterval = layer.roundInterval;
		}
		if (typeof layer.customPrompt === "string" && layer.customPrompt.trim().length > 0) {
			result.customPrompt = layer.customPrompt;
		}
		if (typeof layer.overrideManual === "boolean") result.overrideManual = layer.overrideManual;
		if (
			typeof layer.maxTitleLength === "number" &&
			Number.isInteger(layer.maxTitleLength) &&
			layer.maxTitleLength > 0
		) {
			result.maxTitleLength = layer.maxTitleLength;
		}
		if (typeof layer.cacheThreshold === "number") {
			result.cacheThreshold = Math.min(Math.max(layer.cacheThreshold, 0), 1);
		}
		if (typeof layer.warnThreshold === "number") {
			result.warnThreshold = Math.min(Math.max(layer.warnThreshold, 0), 1);
		}
	}
	return result;
}

/** Read one config file. Missing file or bad JSON → undefined (layer skipped). */
export function loadConfigFile(path: string): ConfigLayer | undefined {
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as ConfigLayer;
		}
		return undefined;
	} catch {
		return undefined;
	}
}

/** Project layer overrides global. Either path may be absent. */
export function resolveConfig(globalPath: string, projectPath: string | undefined): TitleConfig {
	return mergeConfig([
		loadConfigFile(globalPath),
		projectPath ? loadConfigFile(projectPath) : undefined,
	]);
}

export function writeConfigFile(path: string, config: TitleConfig): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
