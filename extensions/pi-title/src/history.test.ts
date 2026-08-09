import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendHistory, readHistory, type HistoryEntry } from "./history.ts";

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
	sessionId: "s1",
	time: "2026-01-01T00:00:00.000Z",
	title: "t",
	cached: true,
	cacheRead: 100,
	cacheWrite: 0,
	inputTokens: 10,
	outputTokens: 5,
	model: "m",
	provider: "p",
	triggeredBy: "auto",
	...over,
});

describe("history", () => {
	let dir: string;
	let path: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "pi-title-hist-"));
		path = join(dir, "nested", "history.jsonl");
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it("returns [] for a missing file", () => {
		expect(readHistory(path, "s1")).toEqual([]);
	});

	it("round-trips and creates parent dirs", () => {
		appendHistory(
			path,
			entry({ title: "a", rawTitle: "  a more verbose raw output  ", triggeredBy: "fresh" }),
		);
		const rows = readHistory(path, "s1");
		expect(rows).toHaveLength(1);
		expect(rows[0].title).toBe("a");
		expect(rows[0].rawTitle).toBe("  a more verbose raw output  ");
		expect(rows[0].triggeredBy).toBe("fresh");
	});

	it("filters by sessionId and returns newest first", () => {
		appendHistory(path, entry({ sessionId: "s1", time: "2026-01-01T00:00:00Z", title: "old" }));
		appendHistory(path, entry({ sessionId: "s2", time: "2026-01-02T00:00:00Z", title: "other" }));
		appendHistory(path, entry({ sessionId: "s1", time: "2026-01-03T00:00:00Z", title: "new" }));
		const rows = readHistory(path, "s1");
		expect(rows.map((r) => r.title)).toEqual(["new", "old"]);
	});

	it("skips malformed and incomplete lines", () => {
		appendHistory(path, entry({ title: "good" }));
		appendFileSync(path, "{ not json\n", "utf8");
		appendFileSync(path, `${JSON.stringify({ sessionId: "s1", title: "missing-fields" })}\n`, "utf8");
		const rows = readHistory(path, "s1");
		expect(rows.map((r) => r.title)).toEqual(["good"]);
	});
});
