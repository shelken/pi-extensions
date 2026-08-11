// 低命中率现场持久化：捕获 live 与标题请求的完整 provider payload 与 usage，
// 命中率低于 warnThreshold 时落盘，供缓存前缀分析（payload 字节级对比）。
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MAX_DUMPS = 10;

export interface RequestUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

export interface MissDumpMeta {
	time: string;
	sessionId: string;
	model: string;
	provider: string;
	triggeredBy: "auto" | "fresh";
	hitRate: number;
	titleUsage: RequestUsage;
}

export class CacheMissDumper {
	private livePayload: unknown;
	private titlePayload: unknown;
	private liveUsage: RequestUsage | undefined;

	/** 最近一次 live 请求的完整 provider payload（before_provider_request 捕获，只存引用）。 */
	captureLiveRequest(payload: unknown): void {
		this.livePayload = payload;
	}

	/** 标题请求自身的完整 provider payload（complete 的 onPayload 捕获）。 */
	captureTitleRequest(payload: unknown): void {
		this.titlePayload = payload;
	}

	captureLiveUsage(usage: RequestUsage): void {
		this.liveUsage = usage;
	}

	/** 落盘当前现场；目录内只保留最近 MAX_DUMPS 份，超限删最旧。 */
	dump(dir: string, meta: MissDumpMeta): void {
		mkdirSync(dir, { recursive: true });
		const file = join(
			dir,
			`miss-${meta.time.replace(/[:.]/g, "-")}-${meta.sessionId.slice(0, 8)}.json`,
		);
		writeFileSync(
			file,
			JSON.stringify({
				meta: { ...meta, liveUsage: this.liveUsage },
				livePayload: this.livePayload,
				titlePayload: this.titlePayload,
			}),
			"utf8",
		);
		const files = readdirSync(dir).filter((f) => f.startsWith("miss-")).sort();
		while (files.length > MAX_DUMPS) {
			rmSync(join(dir, files.shift()!));
		}
	}
}
