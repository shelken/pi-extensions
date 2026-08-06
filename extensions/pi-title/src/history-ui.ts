import { matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import type { HistoryEntry } from "./history.ts";
import { borderedPanel } from "./panel.ts";

function formatTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toISOString().slice(0, 16).replace("T", " ");
}

function formatHitRate(rate: number | undefined): string {
	if (rate === undefined) return "-";
	return `${(rate * 100).toFixed(1)}%`;
}

const COL = { time: 16, title: 24, cached: 6, hit: 10, cacheRead: 10, model: 24 };

/**
 * One table row, each column padded (truncateToWidth pad=true) to a fixed
 * terminal-column width, so CJK titles and narrow columns align across rows.
 */
function row(
	time: string,
	title: string,
	cached: string,
	hit: string,
	cacheRead: string,
	model: string,
): string {
	return [
		truncateToWidth(time, COL.time, "…", true),
		truncateToWidth(title, COL.title, "…", true),
		truncateToWidth(cached, COL.cached, "…", true),
		truncateToWidth(hit, COL.hit, "…", true),
		truncateToWidth(cacheRead, COL.cacheRead, "…", true),
		truncateToWidth(model, COL.model, "…", true),
	].join("  ");
}

/**
 * Read-only table of this session's title history, shown as a floating panel via
 * ui.custom. Esc closes through onDone. pi-tui has no Table component, so rows
 * are hand-built from padded text (truncateToWidth pads by terminal width).
 */
export function createHistoryComponent(entries: HistoryEntry[], onDone: () => void): Component {
	const body: Component = {
		render(width: number): string[] {
			const lines: string[] = [""];
			if (entries.length === 0) {
				lines.push("(no auto-title generated for this session yet)");
				return lines;
			}
			lines.push(row("TIME", "TITLE", "CACHED", "HIT_RATE", "CACHE_READ", "MODEL"));
			lines.push("─".repeat(Math.min(width, 90)));
			for (const entry of entries) {
				lines.push(
					row(
						formatTime(entry.time),
						entry.title,
						entry.cached ? "yes" : "no",
						formatHitRate(entry.cacheHitRate),
						String(entry.cacheRead),
						entry.model,
					),
				);
			}
			return lines;
		},
		invalidate(): void {},
		handleInput(data: string): void {
			if (matchesKey(data, "escape")) onDone();
		},
	};

	return borderedPanel("pi-title 历史  ·  Esc 关闭", body);
}
