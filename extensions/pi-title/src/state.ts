import type { TitleConfig } from "./config.ts";

export interface RoundUsage {
	/** Prompt tokens charged as cache reads (prefix hit). */
	cacheRead: number;
	/** Prompt tokens written into cache (prefix misses). */
	cacheWrite: number;
	/** Uncached prompt tokens (prefix misses without write). */
	input: number;
}

export interface GateState {
	/** Completed user rounds since the last title trigger (or model change). */
	userRoundCount: number;
	/** Cache hit rate of the most recent agent_end (0-1, 0 when no prompt tokens). */
	lastRoundHitRate: number;
	/** Model id active during the most recent agent_end. */
	lastRoundModel: string | undefined;
	/** True once a non-extension actor set the session name. */
	userManuallyTitled: boolean;
	/** The last title this extension set, used to recognize our own changes. */
	lastSetTitle: string | undefined;
}

export function initialState(): GateState {
	return {
		userRoundCount: 0,
		lastRoundHitRate: 0,
		lastRoundModel: undefined,
		userManuallyTitled: false,
		lastSetTitle: undefined,
	};
}

/**
 * Cache hit rate for one round, matching pi's /usage panel semantics:
 * promptTokens = input + cacheRead + cacheWrite; hitRate = cacheRead / promptTokens.
 * No prompt tokens → 0 (can't claim a hit).
 */
export function computeHitRate(usage: RoundUsage): number {
	const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
	if (promptTokens <= 0) return 0;
	return usage.cacheRead / promptTokens;
}

/** A user round completed: bump the counter and snapshot the round's hit-rate/model. */
export function onAgentEnd(state: GateState, usage: RoundUsage, model: string): GateState {
	return {
		...state,
		userRoundCount: state.userRoundCount + 1,
		lastRoundHitRate: computeHitRate(usage),
		lastRoundModel: model,
	};
}

/** Model switched: the cache domain changed, so the counter and snapshot reset. */
export function onModelChange(state: GateState): GateState {
	return { ...state, userRoundCount: 0, lastRoundModel: undefined };
}

/** A title trigger fired: reset the counter regardless of success. */
export function onTriggered(state: GateState): GateState {
	return { ...state, userRoundCount: 0 };
}

/**
 * Decide whether to generate a title now.
 * Gate: enabled, counter hit a multiple of roundInterval, the last round's cache
 * hit rate met the configured threshold (a tiny cacheRead over a huge input is a
 * miss in practice), the model hasn't drifted from that cached round, and the
 * user hasn't manually named the session (unless overrideManual).
 */
export function shouldTrigger(state: GateState, config: TitleConfig, currentModel: string): boolean {
	if (!config.enabled) return false;
	if (state.userRoundCount <= 0) return false;
	if (state.userRoundCount % config.roundInterval !== 0) return false;
	if (state.lastRoundHitRate < config.cacheThreshold) return false;
	if (state.lastRoundModel === undefined || state.lastRoundModel !== currentModel) return false;
	if (state.userManuallyTitled && !config.overrideManual) return false;
	return true;
}

/**
 * Runtime session-name change. A cleared name (user ran `/name ""`) releases the
 * manual lock. A name equal to what we last set is our own write — ignore it.
 * Any other name was set by someone else → lock as manual.
 */
export function onSessionInfoChanged(state: GateState, name: string | undefined): GateState {
	if (name === undefined) {
		return { ...state, userManuallyTitled: false, lastSetTitle: undefined };
	}
	if (name === state.lastSetTitle) return state;
	return { ...state, userManuallyTitled: true };
}

/**
 * Session (re)start. If the session already carries a name we didn't set (resume
 * case — lastSetTitle is undefined on a fresh load), treat it as manual.
 */
export function onSessionStart(state: GateState, currentName: string | undefined): GateState {
	if (currentName !== undefined && currentName !== state.lastSetTitle) {
		return { ...state, userManuallyTitled: true };
	}
	return state;
}

/** Record that we authored a title, so future session_info_changed ignores it. */
export function onTitleSet(state: GateState, title: string): GateState {
	return { ...state, lastSetTitle: title };
}
