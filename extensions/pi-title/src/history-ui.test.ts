import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatTime } from "./history-ui.ts";

const originalTimezone = process.env.TZ;

describe("formatTime", () => {
	beforeAll(() => {
		process.env.TZ = "Asia/Shanghai";
	});

	afterAll(() => {
		if (originalTimezone === undefined) delete process.env.TZ;
		else process.env.TZ = originalTimezone;
	});

	it("displays ISO timestamps in the user's local timezone", () => {
		expect(formatTime("2026-08-09T11:28:33.403Z")).toBe("2026-08-09 19:28");
	});
});
