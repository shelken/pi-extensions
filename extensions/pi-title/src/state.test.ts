import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type TitleConfig } from "./config.ts";
import {
	initialState,
	onAgentEnd,
	onModelChange,
	onSessionInfoChanged,
	onSessionStart,
	onTitleSet,
	onTriggered,
	shouldTrigger,
} from "./state.ts";

const cfg = (over: Partial<TitleConfig> = {}): TitleConfig => ({ ...DEFAULT_CONFIG, ...over });

describe("counter", () => {
	it("increments on agent_end and snapshots cache/model", () => {
		const s = onAgentEnd(initialState(), 1200, "claude-x");
		expect(s.userRoundCount).toBe(1);
		expect(s.lastRoundCacheRead).toBe(1200);
		expect(s.lastRoundModel).toBe("claude-x");
	});

	it("resets counter and model snapshot on model_change", () => {
		const s = onModelChange(onAgentEnd(initialState(), 1200, "claude-x"));
		expect(s.userRoundCount).toBe(0);
		expect(s.lastRoundModel).toBeUndefined();
	});

	it("resets counter on trigger", () => {
		const s = onTriggered(onAgentEnd(onAgentEnd(onAgentEnd(initialState(), 1, "m"), 1, "m"), 1, "m"));
		expect(s.userRoundCount).toBe(0);
	});
});

describe("shouldTrigger", () => {
	const ready = onAgentEnd(onAgentEnd(onAgentEnd(initialState(), 500, "m"), 500, "m"), 500, "m");

	it("fires at a multiple of roundInterval with cache hit and matching model", () => {
		expect(shouldTrigger(ready, cfg({ roundInterval: 3 }), "m")).toBe(true);
	});

	it("blocked when disabled", () => {
		expect(shouldTrigger(ready, cfg({ enabled: false, roundInterval: 3 }), "m")).toBe(false);
	});

	it("blocked before reaching the interval", () => {
		const two = onAgentEnd(onAgentEnd(initialState(), 500, "m"), 500, "m");
		expect(shouldTrigger(two, cfg({ roundInterval: 3 }), "m")).toBe(false);
	});

	it("blocked when the last round did not read cache", () => {
		const noCache = onAgentEnd(onAgentEnd(onAgentEnd(initialState(), 0, "m"), 0, "m"), 0, "m");
		expect(shouldTrigger(noCache, cfg({ roundInterval: 3 }), "m")).toBe(false);
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
