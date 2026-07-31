import { matchesKey, type Component } from "@earendil-works/pi-tui";
import type { HistoryEntry } from "./history.ts";

function pad(text: string, width: number): string {
	const codePoints = [...text];
	if (codePoints.length > width) return `${codePoints.slice(0, width - 1).join("")}…`;
	return text + " ".repeat(width - codePoints.length);
}

function formatTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toISOString().slice(0, 16).replace("T", " ");
}

const COL = { time: 16, title: 26, cached: 7, cacheRead: 10 };

function row(time: string, title: string, cached: string, cacheRead: string, model: string): string {
	return `${pad(time, COL.time)}  ${pad(title, COL.title)}  ${pad(cached, COL.cached)}  ${pad(cacheRead, COL.cacheRead)}  ${model}`;
}

/**
 * Read-only table of this session's title history. Esc closes the widget.
 * pi-tui has no Table component, so rows are hand-built from padded text.
 */
export function createHistoryTable(entries: HistoryEntry[], onClose: () => void): Component {
	return {
		render(width: number): string[] {
			const lines: string[] = ["pi-title · history (current session) — Esc to close", ""];
			if (entries.length === 0) {
				lines.push("(no auto-title generated for this session yet)");
				return lines;
			}
			lines.push(row("TIME", "TITLE", "CACHED", "CACHE_READ", "MODEL"));
			lines.push("─".repeat(Math.min(width, 90)));
			for (const entry of entries) {
				lines.push(
					row(
						formatTime(entry.time),
						entry.title,
						entry.cached ? "yes" : "no",
						String(entry.cacheRead),
						entry.model,
					),
				);
			}
			return lines;
		},
		invalidate(): void {},
		handleInput(data: string): void {
			if (matchesKey(data, "escape")) onClose();
		},
	};
}
