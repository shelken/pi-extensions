import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export interface HistoryEntry {
	sessionId: string;
	/** ISO-8601 timestamp. */
	time: string;
	/** Final title actually set on the session. */
	title: string;
	/** Raw model output before normalization (trimmed quotes kept as-is). */
	rawTitle?: string;
	cached: boolean;
	cacheRead: number;
	cacheWrite: number;
	inputTokens: number;
	outputTokens: number;
	/** Title request's own cache hit rate (0-1). Absent in early records. */
	cacheHitRate?: number;
	model: string;
	provider: string;
	triggeredBy: "auto";
}

const REQUIRED_KEYS: Array<keyof HistoryEntry> = [
	"sessionId",
	"time",
	"title",
	"cached",
	"cacheRead",
	"cacheWrite",
	"inputTokens",
	"outputTokens",
	"model",
	"provider",
	"triggeredBy",
];

function isValidEntry(value: unknown): value is HistoryEntry {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	return REQUIRED_KEYS.every((key) => key in (value as Record<string, unknown>));
}

export function appendHistory(path: string, entry: HistoryEntry): void {
	mkdirSync(dirname(path), { recursive: true });
	appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
}

/**
 * Read history for one session, newest first. Missing file → []. Malformed lines
 * are skipped so one corrupt row can't break the whole log.
 */
export function readHistory(path: string, sessionId: string): HistoryEntry[] {
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch {
		return [];
	}
	const entries: HistoryEntry[] = [];
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			continue;
		}
		if (isValidEntry(parsed) && parsed.sessionId === sessionId) entries.push(parsed);
	}
	return entries.reverse();
}
