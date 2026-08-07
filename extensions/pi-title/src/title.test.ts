import { describe, expect, it } from "vitest";
import { buildTitlePrompt, normalizeTitle } from "./title.ts";

describe("normalizeTitle", () => {
	it("trims surrounding whitespace", () => {
		expect(normalizeTitle("  标题  ")).toBe("标题");
	});

	it("strips ASCII wrapping quotes", () => {
		expect(normalizeTitle('"My Title"')).toBe("My Title");
		expect(normalizeTitle("'My Title'")).toBe("My Title");
	});

	it("strips CJK wrapping quotes", () => {
		expect(normalizeTitle("「会话标题」")).toBe("会话标题");
		expect(normalizeTitle("“会话标题”")).toBe("会话标题");
	});

	it("leaves long titles untouched (length is prompt's job)", () => {
		expect(normalizeTitle("一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六")).toBe(
			"一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六",
		);
	});

	it("returns empty string for whitespace-only input", () => {
		expect(normalizeTitle("   ")).toBe("");
	});
});

describe("buildTitlePrompt", () => {
	it("substitutes the maxTitleLength placeholder", () => {
		expect(buildTitlePrompt("不超过 {maxTitleLength} 字，限 {maxTitleLength}", 15)).toBe(
			"不超过 15 字，限 15",
		);
	});

	it("leaves prompts without the placeholder unchanged", () => {
		expect(buildTitlePrompt("起个标题", 15)).toBe("起个标题");
	});
});
