import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	DEFAULT_CONFIG,
	loadConfigFile,
	mergeConfig,
	resolveConfig,
	writeConfigFile,
} from "./config.ts";

describe("mergeConfig", () => {
	it("returns defaults for no layers", () => {
		expect(mergeConfig([])).toEqual(DEFAULT_CONFIG);
		expect(mergeConfig([undefined, undefined])).toEqual(DEFAULT_CONFIG);
	});

	it("overlays later layers over earlier ones", () => {
		const merged = mergeConfig([
			{ roundInterval: 5, maxTitleLength: 30 },
			{ roundInterval: 7 },
		]);
		expect(merged.roundInterval).toBe(7);
		expect(merged.maxTitleLength).toBe(30);
		expect(merged.enabled).toBe(true);
	});

	it("ignores wrong-typed fields, falling through to default", () => {
		const merged = mergeConfig([
			{ roundInterval: "abc", maxTitleLength: -1, enabled: "yes", customPrompt: "   " },
		]);
		expect(merged.roundInterval).toBe(DEFAULT_CONFIG.roundInterval);
		expect(merged.maxTitleLength).toBe(DEFAULT_CONFIG.maxTitleLength);
		expect(merged.enabled).toBe(true);
		expect(merged.customPrompt).toBe(DEFAULT_CONFIG.customPrompt);
	});

	it("rejects non-positive or non-integer numeric fields", () => {
		expect(mergeConfig([{ roundInterval: 0 }]).roundInterval).toBe(DEFAULT_CONFIG.roundInterval);
		expect(mergeConfig([{ roundInterval: 2.5 }]).roundInterval).toBe(DEFAULT_CONFIG.roundInterval);
		expect(mergeConfig([{ maxTitleLength: 0 }]).maxTitleLength).toBe(DEFAULT_CONFIG.maxTitleLength);
	});

	it("accepts and clamps threshold fields to [0,1]", () => {
		expect(mergeConfig([{ cacheThreshold: 0.5 }]).cacheThreshold).toBe(0.5);
		expect(mergeConfig([{ warnThreshold: 0.95 }]).warnThreshold).toBe(0.95);
		expect(mergeConfig([{ cacheThreshold: 1.5 }]).cacheThreshold).toBe(1);
		expect(mergeConfig([{ warnThreshold: -0.2 }]).warnThreshold).toBe(0);
		expect(mergeConfig([{ cacheThreshold: "high" }]).cacheThreshold).toBe(
			DEFAULT_CONFIG.cacheThreshold,
		);
	});
});

describe("loadConfigFile", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "pi-title-cfg-"));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it("returns undefined for a missing file", () => {
		expect(loadConfigFile(join(dir, "nope.json"))).toBeUndefined();
	});

	it("returns undefined for bad JSON", () => {
		const p = join(dir, "bad.json");
		writeFileSync(p, "{ not json", "utf8");
		expect(loadConfigFile(p)).toBeUndefined();
	});

	it("returns undefined for a non-object root", () => {
		const p = join(dir, "arr.json");
		writeFileSync(p, "[1,2,3]", "utf8");
		expect(loadConfigFile(p)).toBeUndefined();
	});

	it("parses a valid object", () => {
		const p = join(dir, "ok.json");
		writeFileSync(p, JSON.stringify({ roundInterval: 9 }), "utf8");
		expect(loadConfigFile(p)).toEqual({ roundInterval: 9 });
	});
});

describe("resolveConfig", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "pi-title-resolve-"));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it("project layer overrides global", () => {
		const globalPath = join(dir, "global.json");
		const projectPath = join(dir, "project.json");
		writeFileSync(globalPath, JSON.stringify({ roundInterval: 5, maxTitleLength: 40 }), "utf8");
		writeFileSync(projectPath, JSON.stringify({ roundInterval: 2 }), "utf8");
		const merged = resolveConfig(globalPath, projectPath);
		expect(merged.roundInterval).toBe(2);
		expect(merged.maxTitleLength).toBe(40);
	});

	it("tolerates an absent project path", () => {
		const globalPath = join(dir, "global.json");
		writeFileSync(globalPath, JSON.stringify({ enabled: false }), "utf8");
		expect(resolveConfig(globalPath, undefined).enabled).toBe(false);
	});
});

describe("writeConfigFile", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "pi-title-write-"));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it("round-trips through loadConfigFile and creates parent dirs", () => {
		const p = join(dir, "nested", "deep", "config.json");
		const config = { ...DEFAULT_CONFIG, roundInterval: 11, enabled: false };
		writeConfigFile(p, config);
		expect(loadConfigFile(p)).toEqual(config);
	});
});
