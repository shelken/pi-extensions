import { describe, expect, it } from "vitest";
import { describeInvalidSegments, readStatusBarConfig } from "../src/config.ts";
import { BAR_IDS } from "../src/format.ts";

describe("config", () => {
	it("缺失或形状不符时回退默认顺序", () => {
		expect(readStatusBarConfig(undefined)).toEqual({ order: BAR_IDS, invalid: [] });
		expect(readStatusBarConfig({})).toEqual({ order: BAR_IDS, invalid: [] });
		expect(readStatusBarConfig({ statusBar: 1 })).toEqual({ order: BAR_IDS, invalid: ["1"] });
	});

	it("order 非数组时整体回退并报告原值", () => {
		expect(readStatusBarConfig({ statusBar: { order: "cost" } })).toEqual({ order: BAR_IDS, invalid: ['"cost"'] });
	});

	it("按 order 取值，可用于重排与精简", () => {
		expect(readStatusBarConfig({ statusBar: { order: ["dir", "git", "cost"] } }).order).toEqual(["dir", "git", "cost"]);
	});

	it("忽略未知名、非字符串与重复项，并逐项报告", () => {
		const config = readStatusBarConfig({ statusBar: { order: ["cost", "nope", 42, "cost"] } });
		expect(config.order).toEqual(["cost"]);
		expect(config.invalid).toEqual(['"nope"', "42", "cost"]);
		expect(describeInvalidSegments(config.invalid)).toBe('忽略无效的 statusBar.order 项: "nope", 42, cost');
	});

	it("空数组合法，表示状态条不显示任何段", () => {
		expect(readStatusBarConfig({ statusBar: { order: [] } })).toEqual({ order: [], invalid: [] });
	});
});
