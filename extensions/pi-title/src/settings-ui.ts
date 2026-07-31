import { SettingsList, type SettingItem, type SettingsListTheme } from "@earendil-works/pi-tui";
import { DEFAULT_PROMPT, type TitleConfig } from "./config.ts";

const ROUND_INTERVALS = ["1", "2", "3", "5", "8", "10"];
const MAX_LENGTHS = ["10", "15", "20", "30", "50"];
const BOOL = ["true", "false"];

/**
 * Config editor on pi-tui's select-based SettingsList. Numeric fields cycle
 * through presets; customPrompt can be reset to the built-in default (a bespoke
 * prompt is set in config.json). Each change calls onSave, which persists to the
 * global config.json and reloads runtime state. Esc closes via onCancel.
 */
export function createSettingsComponent(opts: {
	config: TitleConfig;
	theme: SettingsListTheme;
	onSave: (config: TitleConfig) => void;
	onDone: () => void;
}): SettingsList {
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
		8,
		opts.theme,
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

	return list;
}
