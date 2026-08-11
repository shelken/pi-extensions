// 诊断日志：写入 {pi-agent-dir}/logs/pi-title.log，用于排查标题请求异常。
// 日志失败不影响主流程。
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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

