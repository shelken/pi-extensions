import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { BAR_IDS, type BarId } from "./format.ts";

export interface StatusBarConfig {
	order: readonly BarId[];
	invalid: string[];
}

/** statusBar 是扩展自定义键，不在宿主 settings schema 内 */
interface HostSettingsWithStatusBar {
	statusBar?: unknown;
}

/** statusBar 的约定形状；内容仍逐个校验 */
interface StatusBarSetting {
	order?: unknown;
}

type HostSettings = ReturnType<ExtensionAPI["getSettings"]>;

const DEFAULT: StatusBarConfig = { order: BAR_IDS, invalid: [] };

/** 段名的 JSON 文本即规范形式，解析前无需相信输入形状 */
const ID_BY_TEXT: ReadonlyMap<string, BarId> = new Map(
	BAR_IDS.map((id): [string, BarId] => [JSON.stringify(id), id]),
);

/** 缺失、非数组或非法项都回退默认顺序；非法项原样报告，不抛错 */
export function readStatusBarConfig(settings: HostSettings | undefined): StatusBarConfig {
	// SAFETY: 宿主不对 settings 做 schema 校验（settings-manager: Settings files are not validated），
	// statusBar 键原样保留
	const raw: unknown = settings === undefined ? undefined : (settings as HostSettingsWithStatusBar).statusBar;
	if (raw === undefined) return DEFAULT;
	if (!(raw instanceof Object) || Array.isArray(raw)) return { ...DEFAULT, invalid: [JSON.stringify(raw) ?? "?"] };

	// SAFETY: 上一行已排除 null、数组与原始值，statusBar 是普通对象；order 值仍逐个校验
	const entries: unknown = (raw as StatusBarSetting).order;
	if (entries === undefined) return DEFAULT;
	if (!(entries instanceof Array)) return { ...DEFAULT, invalid: [JSON.stringify(entries) ?? "?"] };

	const order: BarId[] = [];
	const invalid: string[] = [];
	for (const entry of entries) {
		const text: string = JSON.stringify(entry) ?? "?";
		const id = ID_BY_TEXT.get(text);
		if (id === undefined) invalid.push(text);
		else if (order.includes(id)) invalid.push(id);
		else order.push(id);
	}
	return { order, invalid };
}

export function describeInvalidSegments(invalid: readonly string[]): string {
	return `忽略无效的 statusBar.order 项: ${invalid.join(", ")}`;
}
