import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type TitleConfig } from "./config.ts";
import {
	computeHitRate,
	initialState,
	onAgentEnd,
	onModelChange,
	onSessionInfoChanged,
	onSessionStart,
	onTitleSet,
	onTriggered,
	shouldTrigger,
	type RoundUsage,
} from "./state.ts";

const cfg = (over: Partial<TitleConfig> = {}): TitleConfig => ({ ...DEFAULT_CONFIG, ...over });

const usage = (cacheRead: number, cacheWrite = 0, input = 0): RoundUsage => ({
	cacheRead,
	cacheWrite,
	input,
});

describe("computeHitRate", () => {
	it("is cacheRead over total prompt tokens", () => {
		expect(computeHitRate(usage(500, 0, 500))).toBe(0.5);
		expect(computeHitRate(usage(900, 50, 50))).toBe(0.9);
	});

	it("includes cacheWrite in the denominator", () => {
		expect(computeHitRate(usage(500, 500, 0))).toBe(0.5);
	});

	it("is 0 when there are no prompt tokens", () => {
		expect(computeHitRate(usage(0, 0, 0))).toBe(0);
	});

	it("is 0 when cacheRead alone would claim a hit but input dwarfs it", () => {
		expect(computeHitRate(usage(256, 0, 146890))).toBeLessThan(0.01);
	});
});

describe("counter", () => {
	it("increments on agent_end and snapshots hit-rate/model", () => {
		const s = onAgentEnd(initialState(), usage(1200, 0, 800), "claude-x");
		expect(s.userRoundCount).toBe(1);
		expect(s.lastRoundHitRate).toBe(0.6);
		expect(s.lastRoundModel).toBe("claude-x");
	});

	it("resets counter and model snapshot on model_change", () => {
		const s = onModelChange(onAgentEnd(initialState(), usage(1200, 0, 0), "claude-x"));
		expect(s.userRoundCount).toBe(0);
		expect(s.lastRoundModel).toBeUndefined();
	});

	it("resets counter on trigger", () => {
		const s = onTriggered(
			onAgentEnd(onAgentEnd(onAgentEnd(initialState(), usage(500, 0, 0), "m"), usage(500, 0, 0), "m"), usage(500, 0, 0), "m"),
		);
		expect(s.userRoundCount).toBe(0);
	});
});

describe("shouldTrigger", () => {
	// 3 rounds, each 100% cache hit.
	const ready = onAgentEnd(
		onAgentEnd(onAgentEnd(initialState(), usage(500), "m"), usage(500), "m"),
		usage(500),
		"m",
	);

	it("fires at a multiple of roundInterval with hit rate meeting threshold and matching model", () => {
		expect(shouldTrigger(ready, cfg({ roundInterval: 3 }), "m")).toBe(true);
	});

	it("blocked when disabled", () => {
		expect(shouldTrigger(ready, cfg({ enabled: false, roundInterval: 3 }), "m")).toBe(false);
	});

	it("blocked before reaching the interval", () => {
		const two = onAgentEnd(onAgentEnd(initialState(), usage(500), "m"), usage(500), "m");
		expect(shouldTrigger(two, cfg({ roundInterval: 3 }), "m")).toBe(false);
	});

	it("blocked when the last round had no cache at all", () => {
		const noCache = onAgentEnd(
			onAgentEnd(onAgentEnd(initialState(), usage(0, 0, 1000), "m"), usage(0, 0, 1000), "m"),
			usage(0, 0, 1000),
			"m",
		);
		expect(shouldTrigger(noCache, cfg({ roundInterval: 3 }), "m")).toBe(false);
	});

	it("blocked when cacheRead exists but hit rate is below threshold", () => {
		// The exact regression from history: cacheRead=256 over input=146890 (~0.17%).
		const lowRate = onAgentEnd(
			onAgentEnd(onAgentEnd(initialState(), usage(256, 0, 146890), "m"), usage(256, 0, 146890), "m"),
			usage(256, 0, 146890),
			"m",
		);
		expect(shouldTrigger(lowRate, cfg({ roundInterval: 3 }), "m")).toBe(false);
	});

	it("fires when hit rate exactly meets the threshold", () => {
		const exactly = onAgentEnd(
			onAgentEnd(onAgentEnd(initialState(), usage(500, 0, 500), "m"), usage(500, 0, 500), "m"),
			usage(500, 0, 500),
			"m",
		);
		expect(shouldTrigger(exactly, cfg({ roundInterval: 3 }), "m")).toBe(true);
	});

	it("blocked when the model drifted from the cached round", () => {
		expect(shouldTrigger(ready, cfg({ roundInterval: 3 }), "other-model")).toBe(false);
	});

	it("blocked when manually titled, unless overrideManual", () => {
		const manual = { ...ready, userManuallyTitled: true };
		expect(shouldTrigger(manual, cfg({ roundInterval: 3 }), "m")).toBe(false);
		expect(shouldTrigger(manual, cfg({ roundInterval: 3, overrideManual: true }), "m")).toBe(true);
	});
});

describe("manual detection", () => {
	it("a cleared name releases the manual lock", () => {
		const locked = { ...initialState(), userManuallyTitled: true, lastSetTitle: "old" };
		const s = onSessionInfoChanged(locked, undefined);
		expect(s.userManuallyTitled).toBe(false);
		expect(s.lastSetTitle).toBeUndefined();
	});

	it("ignores our own title write", () => {
		const s = onSessionInfoChanged(onTitleSet(initialState(), "mine"), "mine");
		expect(s.userManuallyTitled).toBe(false);
	});

	it("locks on a foreign name", () => {
		const s = onSessionInfoChanged(onTitleSet(initialState(), "mine"), "someone-else");
		expect(s.userManuallyTitled).toBe(true);
	});

	it("resume with a pre-existing name locks as manual", () => {
		expect(onSessionStart(initialState(), "restored").userManuallyTitled).toBe(true);
	});

	it("fresh session with no name stays unlocked", () => {
		expect(onSessionStart(initialState(), undefined).userManuallyTitled).toBe(false);
	});
});
