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
			description: "自动标题总开关，不影响 /title fresh。",
			currentValue: String(config.enabled),
			values: BOOL,
		},
		{
			id: "roundInterval",
			label: "roundInterval",
			description: "缓存门闩通过时，每 N 轮用户对话生成一次标题。",
			currentValue: String(config.roundInterval),
			values: ROUND_INTERVALS,
		},
		{
			id: "maxTitleLength",
			label: "maxTitleLength",
			description: "提示模型遵守的标题长度上限。",
			currentValue: String(config.maxTitleLength),
			values: MAX_LENGTHS,
		},
		{
			id: "cacheThreshold",
			label: "cacheThreshold",
			description: "上一轮缓存命中率达到此值（0-1）时才自动生成标题。",
			currentValue: String(config.cacheThreshold),
			values: THRESHOLDS,
		},
		{
			id: "warnThreshold",
			label: "warnThreshold",
			description: "标题请求缓存命中率低于此值（0-1）时显示警告。",
			currentValue: String(config.warnThreshold),
			values: THRESHOLDS,
		},
		{
			id: "overrideManual",
			label: "overrideManual",
			description: "自动标题是否覆盖手动设置的会话名称。",
			currentValue: String(config.overrideManual),
			values: BOOL,
		},
		{
			id: "debug",
			label: "debug",
			description: "开启后每次标题请求都把 live 与 title 的完整 provider payload 落盘到 {pi-agent-dir}/logs/pi-title-miss/，供缓存前缀字节级对比。",
			currentValue: String(config.debug),
			values: BOOL,
		},
		{
			id: "customPrompt",
			label: "customPrompt",
			description: "在 config.json 中设置自定义提示词；此处可恢复内置默认值。",
			currentValue: config.customPrompt === DEFAULT_PROMPT ? "(默认)" : "(自定义)",
			values: config.customPrompt === DEFAULT_PROMPT ? undefined : ["(默认)"],
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
					if (newValue === "(默认)") {
						save({ ...config, customPrompt: DEFAULT_PROMPT }, id, "(默认)");
					}
					break;
			}
		},
		() => opts.onDone(),
	);

	const container = borderedPanel("pi-title 设置  ·  Esc 关闭", list);

	return container;
}
