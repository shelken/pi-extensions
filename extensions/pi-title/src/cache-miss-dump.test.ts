import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CacheMissDumper, type MissDumpMeta } from "./cache-miss-dump.ts";

const meta = (over: Partial<MissDumpMeta> = {}): MissDumpMeta => ({
	time: "2026-01-01T00:00:00.000Z",
	sessionId: "s1",
	model: "deepseek/deepseek-v4-flash",
	provider: "deepseek",
	triggeredBy: "auto",
	hitRate: 0,
	titleUsage: { input: 100, output: 10, cacheRead: 0, cacheWrite: 0 },
	...over,
});

describe("cache-miss-dump", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "pi-title-miss-"));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it("writes live and title payloads plus usage", () => {
		const dumper = new CacheMissDumper();
		dumper.captureLiveRequest({ model: "m", messages: [{ role: "user", content: "live" }] });
		dumper.captureTitleRequest({ model: "m", messages: [{ role: "user", content: "title" }] });
		dumper.captureLiveUsage({ input: 70000, output: 500, cacheRead: 70528, cacheWrite: 0 });
		dumper.dump(dir, meta());

		const files = readdirSync(dir).filter((f) => f.startsWith("miss-"));
		expect(files).toHaveLength(1);
		const data = JSON.parse(readFileSync(join(dir, files[0]), "utf8"));
		expect(data.meta.liveUsage).toEqual({ input: 70000, output: 500, cacheRead: 70528, cacheWrite: 0 });
		expect(data.livePayload.messages[0].content).toBe("live");
		expect(data.titlePayload.messages[0].content).toBe("title");
	});

	it("keeps only the newest MAX_DUMPS dumps", () => {
		const dumper = new CacheMissDumper();
		for (let i = 0; i < 13; i++) {
			dumper.dump(dir, meta({ time: `2026-01-01T00:00:${String(i).padStart(2, "0")}Z` }));
		}
		const files = readdirSync(dir).filter((f) => f.startsWith("miss-")).sort();
		expect(files).toHaveLength(10);
		// 最老的 3 份被删除：剩余的是时间戳最大的 10 份
		expect(files[0]).toContain("00-00-03");
	});

	it("dump without captured live payload still writes", () => {
		const dumper = new CacheMissDumper();
		dumper.dump(dir, meta());
		const files = readdirSync(dir).filter((f) => f.startsWith("miss-"));
		expect(files).toHaveLength(1);
		expect(existsSync(join(dir, files[0]))).toBe(true);
	});
});
