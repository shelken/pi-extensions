import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import {
	SettingsList,
	type Component,
	type SettingItem,
} from "@earendil-works/pi-tui";
import { DEFAULT_PROMPT, type TitleConfig } from "./config.ts";
import { borderedPanel } from "./panel.ts";

const ROUND_INTERVALS = ["1", "2", "3", "5", "8", "10"];
const MAX_LENGTHS = ["10", "15", "20", "30", "50"];
const BOOL = ["true", "false"];
const THRESHOLDS = ["0.3", "0.4", "0.5", "0.6", "0.7", "0.8", "0.9", "0.95", "1.0"];

/**
 * Config editor floating panel (pattern ported from pi-codebuddy-provider's
 * settings-ui): SettingsList inside a DynamicBorder container, keyboard focus via
 * ui.custom, Esc closes through onDone. Each change calls onSave, which persists
 * to the global config.json and reloads runtime state.
 */
export function createSettingsComponent(opts: {
	config: TitleConfig;
	onSave: (config: TitleConfig) => void;
	onDone: () => void;
}): Component {
	let config: TitleConfig = { ...opts.config };

	const buildItems = (): SettingItem[] => [
		{
			id: "enabled",
			label: "enabled",
			description: "Master switch for automatic titling.",
			currentValue: String(config.enabled),
			values: BOOL,
		},
		{
			id: "roundInterval",
			label: "roundInterval",
			description: "Generate a title every N user rounds (when the cache gate passes).",
			currentValue: String(config.roundInterval),
			values: ROUND_INTERVALS,
		},
		{
			id: "maxTitleLength",
			label: "maxTitleLength",
			description: "Truncate generated titles to this many characters.",
			currentValue: String(config.maxTitleLength),
			values: MAX_LENGTHS,
		},
		{
			id: "cacheThreshold",
			label: "cacheThreshold",
			description: "Minimum previous-round cache hit rate (0-1) required to trigger a title.",
			currentValue: String(config.cacheThreshold),
			values: THRESHOLDS,
		},
		{
			id: "warnThreshold",
			label: "warnThreshold",
			description: "Warn when the title request's cache hit rate falls below this (0-1).",
			currentValue: String(config.warnThreshold),
			values: THRESHOLDS,
		},
		{
			id: "overrideManual",
			label: "overrideManual",
			description: "Overwrite a manually-set session name instead of respecting it.",
			currentValue: String(config.overrideManual),
			values: BOOL,
		},
		{
			id: "customPrompt",
			label: "customPrompt",
			description: "Reset to the built-in default. A bespoke prompt is set in config.json.",
			currentValue: config.customPrompt === DEFAULT_PROMPT ? "(default)" : "(custom)",
			values: config.customPrompt === DEFAULT_PROMPT ? undefined : ["(default)"],
		},
	];

	let list: SettingsList;
	const save = (next: TitleConfig, id: string, newValue: string): void => {
		config = next;
		opts.onSave(config);
		list.updateValue(id, newValue);
	};

	list = new SettingsList(
		buildItems(),
		Math.min(buildItems().length + 2, 12),
		getSettingsListTheme(),
		(id: string, newValue: string) => {
			switch (id) {
				case "enabled":
					save({ ...config, enabled: newValue === "true" }, id, newValue);
					break;
				case "roundInterval":
					save({ ...config, roundInterval: Number(newValue) }, id, newValue);
					break;
				case "maxTitleLength":
					save({ ...config, maxTitleLength: Number(newValue) }, id, newValue);
					break;
				case "cacheThreshold":
					save({ ...config, cacheThreshold: Number(newValue) }, id, newValue);
					break;
				case "warnThreshold":
					save({ ...config, warnThreshold: Number(newValue) }, id, newValue);
					break;
				case "overrideManual":
					save({ ...config, overrideManual: newValue === "true" }, id, newValue);
					break;
				case "customPrompt":
					if (newValue === "(default)") {
						save({ ...config, customPrompt: DEFAULT_PROMPT }, id, "(default)");
					}
					break;
			}
		},
		() => opts.onDone(),
	);

	const container = borderedPanel("pi-title 设置  ·  Esc 关闭", list);

	return container;
}
