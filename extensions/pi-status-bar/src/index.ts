import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { basename, createPaint, parseGitStatus, promptText, renderBar, renderLastPrompt, type GitCounts } from "./format.ts";

const BAR_KEY = "status-bar";
const PROMPT_KEY = "status-bar-last-prompt";

interface Stats {
	key: string;
	cacheRead: number;
	cost: number;
}

export default function statusBar(pi: ExtensionAPI) {
	let ctx: ExtensionContext | undefined;
	let branch: string | null = null;
	let git: GitCounts | undefined;
	let lastPrompt = "";
	let requestRender = () => {};
	let stats: Stats = { key: "", cacheRead: 0, cost: 0 };

	// 不替换编辑器，只用 widget：编辑器边框保持原生，行首不加空格
	function readStats(c: ExtensionContext): Stats {
		const entries = c.sessionManager.getBranch();
		const key = `${entries.length}:${entries.at(-1)?.id ?? ""}`;
		if (key === stats.key) return stats;
		let cacheRead = 0;
		let cost = 0;
		for (const entry of entries) {
			if (entry.type !== "message" || entry.message.role !== "assistant") continue;
			cacheRead += entry.message.usage.cacheRead;
			cost += entry.message.usage.cost.total;
		}
		stats = { key, cacheRead, cost };
		return stats;
	}

	async function refreshGit(cwd: string) {
		const result = await pi.exec("git", ["status", "--porcelain=v1"], { cwd, timeout: 5_000 }).catch(() => undefined);
		git = result?.code === 0 ? parseGitStatus(result.stdout) : undefined;
		requestRender();
	}

	function lastPromptOf(c: ExtensionContext): string {
		const entries = c.sessionManager.getBranch();
		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i];
			if (entry.type === "message" && entry.message.role === "user") return promptText(entry.message.content);
		}
		return "";
	}

	pi.on("session_start", (_event, context) => {
		if (!context.hasUI) return;
		ctx = context;
		lastPrompt = lastPromptOf(context);
		stats = { key: "", cacheRead: 0, cost: 0 };
		void refreshGit(context.cwd);

		// 内置 footer 的 pwd/token 行与本条重复；只保留扩展状态，并借它拿 git 分支
		context.ui.setFooter((tui, _theme, footerData) => {
			branch = footerData.getGitBranch();
			const unsubscribe = footerData.onBranchChange(() => {
				branch = footerData.getGitBranch();
				void refreshGit(context.cwd);
				tui.requestRender();
			});
			return {
				dispose: unsubscribe,
				invalidate() {},
				render(width: number): string[] {
					const statuses = [...footerData.getExtensionStatuses().values()];
					return statuses.length ? [truncateToWidth(statuses.join(" "), width)] : [];
				},
			};
		});

		context.ui.setWidget(BAR_KEY, (tui, theme) => {
			requestRender = () => tui.requestRender();
			const paint = createPaint((color, text) => theme.fg(color, text));
			return {
				invalidate() {},
				render(width: number): string[] {
					if (!ctx) return [];
					const { cacheRead, cost } = readStats(ctx);
					const usage = ctx.getContextUsage();
					const line = renderBar(
						{
							model: ctx.model?.name,
							thinking: pi.getThinkingLevel(),
							dir: basename(ctx.cwd),
							branch,
							git,
							context: usage && { tokens: usage.tokens, window: usage.contextWindow, percent: usage.percent },
							cacheRead,
							cost,
						},
						paint,
					);
					return [truncateToWidth(line, width)];
				},
			};
		});

		context.ui.setWidget(
			PROMPT_KEY,
			() => ({
				invalidate() {},
				render: (width: number) =>
					renderLastPrompt(lastPrompt, width, (s, w) => truncateToWidth(s, w, "…")),
			}),
			{ placement: "belowEditor" },
		);
	});

	pi.on("message_start", (event) => {
		if (event.message.role === "user") lastPrompt = promptText(event.message.content);
		requestRender();
	});
	pi.on("message_end", () => requestRender());
	pi.on("agent_end", () => {
		if (ctx) void refreshGit(ctx.cwd);
	});
	pi.on("model_select", () => requestRender());
	pi.on("thinking_level_select", () => requestRender());
}
