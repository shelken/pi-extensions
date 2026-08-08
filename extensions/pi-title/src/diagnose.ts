// 诊断日志：写入 {pi-agent-dir}/logs/pi-title.log（对齐其他扩展），用于排查
// opencode 下标题请求空返回/缓存 0% 问题。日志失败不影响主流程。
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Message } from "@earendil-works/pi-ai";

const LOG_DIR = join(homedir(), ".pi", "agent", "logs");
const LOG_FILE = join(LOG_DIR, "pi-title.log");

export function logTitle(line: string): void {
	try {
		mkdirSync(LOG_DIR, { recursive: true });
		appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`);
	} catch {
		/* 日志失败不影响主流程 */
	}
}

/** 上下文指纹：消息数 + 最后一条消息 role/type/文本摘要，用于对比主请求与标题请求。 */
export function msgFingerprint(msgs: readonly { role?: string; content?: unknown }[]): string {
	const last = msgs[msgs.length - 1];
	const lastText = (() => {
		if (!last) return "-";
		const c = last.content;
		if (typeof c === "string") return c.slice(0, 80);
		if (Array.isArray(c)) {
			const types = c.map((b) => (b && typeof b === "object" ? (b as { type?: string }).type : undefined)).join(",");
			const text = c
				.filter((b) => b && typeof b === "object" && (b as { type?: string }).type === "text")
				.map((b) => (b as { text?: string }).text ?? "")
				.join("");
			return `types=${types} text=${JSON.stringify(text.slice(0, 80))}`;
		}
		return "-";
	})();
	return JSON.stringify({ count: msgs.length, lastRole: last?.role, lastText });
}
