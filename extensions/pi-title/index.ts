import { join } from "node:path";
import {
	buildSessionContext,
	convertToLlm,
	getAgentDir,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type {
	Api,
	AssistantMessage,
	Context,
	Message,
	Model,
	ThinkingLevel,
	Tool,
	UserMessage,
} from "@earendil-works/pi-ai";
import { resolveConfig, writeConfigFile, type TitleConfig } from "./src/config.ts";
import { CacheMissDumper } from "./src/cache-miss-dump.ts";
import { logTitle, msgFingerprint } from "./src/diagnose.ts";
import { appendHistory, readHistory, type HistoryEntry } from "./src/history.ts";
import { applyContextPruneIndex } from "./src/title-request.ts";
import { createHistoryComponent } from "./src/history-ui.ts";
import { createSettingsComponent } from "./src/settings-ui.ts";
import {
	computeHitRate,
	initialState,
	onAgentEnd,
	onModelChange,
	onSessionInfoChanged,
	onSessionStart,
	onTitleSet,
	onTriggered,
	shouldTrigger,
	type GateState,
} from "./src/state.ts";
import {
	buildTitlePrompt,
	normalizeTitle,
	parseTitleSubcommand,
	TITLE_SUBCOMMANDS,
} from "./src/title.ts";

function modelKey(model: Model<Api>): string {
	return `${model.provider}/${model.id}`;
}

const TITLE_SUBCOMMAND_DESCRIPTIONS = {
	fresh: "立即生成新标题",
	history: "查看本会话的标题历史",
	config: "修改 pi-title 配置",
} as const;

export default function piTitle(pi: ExtensionAPI): void {
	let config: TitleConfig | undefined;
	let state: GateState = initialState();
	let historyPath = "";
	let globalConfigPath = "";
	let inFlight = false;
	const missDumper = new CacheMissDumper();

	const log = (err: unknown): void => console.error("[pi-title]", err);

	function loadConfig(cwd: string): void {
		const agentDir = getAgentDir();
		historyPath = join(agentDir, "extensions", "pi-title", "history.jsonl");
		globalConfigPath = join(agentDir, "extensions", "pi-title", "config.json");
		const projectPath = cwd ? join(cwd, ".pi", "extensions", "pi-title", "config.json") : undefined;
		config = resolveConfig(globalConfigPath, projectPath);
	}

	pi.on("session_start", async (_event, ctx) => {
		loadConfig(ctx.cwd);
		state = onSessionStart(state, ctx.sessionManager.getSessionName());
	});

	pi.on("session_info_changed", async (event) => {
		state = onSessionInfoChanged(state, event.name);
	});

	pi.on("model_select", async () => {
		state = onModelChange(state);
	});

	// Live 请求的完整 payload（agent 路径 onPayload 触发，标题请求不走此路径，无需区分）。
	pi.on("before_provider_request", async (event) => {
		missDumper.captureLiveRequest(event.payload);
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!ctx.model) return;
		const lastAssistant = [...event.messages]
			.reverse()
			.find((m): m is AssistantMessage => m.role === "assistant");
		const usage = lastAssistant?.usage;
		logTitle(
			`[agent_end] model=${modelKey(ctx.model)} usage=${JSON.stringify({ input: usage?.input, output: usage?.output, cacheRead: usage?.cacheRead, cacheWrite: usage?.cacheWrite })} msgs=${msgFingerprint(event.messages)} sysLen=${ctx.getSystemPrompt()?.length ?? -1} tools=${[...pi.getActiveTools()].sort().join(",")}`,
		);
		const roundUsage = {
			cacheRead: usage?.cacheRead ?? 0,
			cacheWrite: usage?.cacheWrite ?? 0,
			input: usage?.input ?? 0,
		};
		missDumper.captureLiveUsage({
			...roundUsage,
			output: usage?.output ?? 0,
		});
		state = onAgentEnd(state, roundUsage, modelKey(ctx.model));
	});

	pi.on("agent_settled", async (_event, ctx) => {
		if (!ctx.hasUI || !config || !ctx.model || inFlight) return;
		if (!shouldTrigger(state, config, modelKey(ctx.model))) return;
		state = onTriggered(state);
		void generateTitle(ctx).catch(log);
	});

	async function generateTitle(
		ctx: ExtensionContext,
		triggeredBy: HistoryEntry["triggeredBy"] = "auto",
	): Promise<void> {
		if (!config || !ctx.model) return;
		inFlight = true;
		try {
			const sessionContext = buildSessionContext(ctx.sessionManager.buildContextEntries());
			const messages = applyContextPruneIndex(
				sessionContext.messages,
				ctx.sessionManager.getBranch(),
			);
			const titleMessage: UserMessage = {
				role: "user",
				content: buildTitlePrompt(config.customPrompt, config.maxTitleLength),
				timestamp: Date.now(),
			};
			const activeNames = new Set(pi.getActiveTools());
			const tools = pi.getAllTools().filter((t) => activeNames.has(t.name)) as Tool[];
			logTitle(
				`[title-req] model=${modelKey(ctx.model)} msgs=${msgFingerprint([...(convertToLlm(messages) as unknown as Message[]), titleMessage])} sysLen=${ctx.getSystemPrompt()?.length ?? -1} tools=${tools.map((t) => t.name).sort().join(",")}`,
			);
			const context: Context = {
				systemPrompt: ctx.getSystemPrompt(),
				// Live rounds go through convertToLlm (custom → user, bashExecution → user) before
				// hitting the provider. The title request must apply the same transform: custom
				// messages (context-prune summary, web-search results) keep role "custom" in
				// buildSessionContext output, and provider converters (e.g. codebuddy's
				// contextToOpenAIMessages) drop unknown roles — that busted the cache prefix at
				// the first custom message (~97k uncached input tokens on the 08-07 incident).
				messages: [...(convertToLlm(messages) as unknown as Message[]), titleMessage],
				tools,
			};
			// complete 走 ModelRuntime.prepareRequest：自动注入 auth（env/凭据），
			// 与主会话同一认证链路。直接用 provider.streamSimple 会绕过 auth 注入，
			// 内置 provider（deepseek/opencode 等）在 api 层 getClientApiKey 处抛
			// "No API key"，被 lazyStream 吞成空流（08-08 排查结论）。
			const result = await ctx.modelRegistry.complete(ctx.model, context, {
				sessionId: ctx.sessionManager.getSessionId(),
				cacheRetention: "short",
				...(ctx.thinkingLevel ? { reasoning: ctx.thinkingLevel as ThinkingLevel } : {}),
				onPayload: (payload: unknown) => {
					missDumper.captureTitleRequest(payload);
					return undefined;
				},
			});
			if (result.stopReason === "error") {
				throw new Error(result.errorMessage ?? "pi-title request failed without an error message");
			}
			const text = result.content
				.filter((c): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text)
				.join("");
			const title = normalizeTitle(text);
			const usage = result.usage;
			const hitRate = computeHitRate({
				cacheRead: usage.cacheRead,
				cacheWrite: usage.cacheWrite,
				input: usage.input,
			});
			// Low cache-hit on the title request itself: the prefix didn't carry over.
			// Warn every time — no rate limit (user's explicit choice).
			logTitle(
				`[title-res] model=${modelKey(ctx.model)} raw=${JSON.stringify(text.slice(0, 300))} usage=${JSON.stringify({ input: usage.input, output: usage.output, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite })} hitRate=${hitRate} title=${JSON.stringify(title)} stop=${result.stopReason} err=${JSON.stringify(result.errorMessage ?? null)}`,
			);
			if (hitRate < config.warnThreshold) {
				ctx.ui.notify(
					`pi-title: 自动标题缓存命中率仅 ${(hitRate * 100).toFixed(1)}% (低于 ${(config.warnThreshold * 100).toFixed(0)}%)`,
					"warning",
				);
				try {
					// 现场锁定：完整 payload 落盘供缓存前缀字节级对比（保留最近 10 份）。
					missDumper.dump(join(getAgentDir(), "logs", "pi-title-miss"), {
						time: new Date().toISOString(),
						sessionId: ctx.sessionManager.getSessionId(),
						model: modelKey(ctx.model),
						provider: ctx.model.provider,
						triggeredBy,
						hitRate,
						titleUsage: {
							input: usage.input,
							output: usage.output,
							cacheRead: usage.cacheRead,
							cacheWrite: usage.cacheWrite,
						},
					});
				} catch (err) {
					log(err);
				}
			}
			const entry: HistoryEntry = {
				sessionId: ctx.sessionManager.getSessionId(),
				time: new Date().toISOString(),
				title,
				rawTitle: text,
				cached: usage.cacheRead > 0,
				cacheRead: usage.cacheRead,
				cacheWrite: usage.cacheWrite,
				inputTokens: usage.input,
				outputTokens: usage.output,
				cacheHitRate: hitRate,
				model: modelKey(ctx.model),
				provider: ctx.model.provider,
				triggeredBy,
			};
			if (!title) return;
			if (
				triggeredBy === "auto" &&
				state.userManuallyTitled &&
				!config.overrideManual
			)
				return;
			// Record our write BEFORE setSessionName: setSessionName synchronously
			// emits session_info_changed, whose handler runs before the line after
			// this call — without the pre-record, the handler sees our own name as
			// foreign and locks userManuallyTitled, killing all future triggers.
			state = onTitleSet(state, title);
			try {
				appendHistory(historyPath, entry);
			} catch (err) {
				log(err);
			}
			pi.setSessionName(title);
		} catch (err) {
			logTitle(`[title-err] ${String(err)}`);
			throw err;
		} finally {
			inFlight = false;
		}
	}

	pi.registerCommand("title", {
		description: "生成新标题、查看历史或修改配置。",
		getArgumentCompletions: (prefix) => {
			const value = prefix.trim().toLowerCase();
			const items = TITLE_SUBCOMMANDS.filter((command) => command.startsWith(value)).map(
				(command) => ({
					value: command,
					label: command,
					description: TITLE_SUBCOMMAND_DESCRIPTIONS[command],
				}),
			);
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			const command = parseTitleSubcommand(args);
			if (!command) {
				ctx.ui.notify("Usage: /title <fresh|history|config>", "error");
				return;
			}

			if (command === "fresh") {
				if (!config || !ctx.model) {
					ctx.ui.notify("pi-title: no active model", "error");
					return;
				}
				if (inFlight) {
					ctx.ui.notify("pi-title: title generation is already running", "warning");
					return;
				}
				state = onTriggered(state);
				await generateTitle(ctx, "fresh");
				return;
			}

			if (command === "history") {
				const entries = readHistory(historyPath, ctx.sessionManager.getSessionId());
				await ctx.ui.custom(
					(_tui, _theme, _kb, done) =>
						createHistoryComponent(entries, () => done(undefined)),
					{ overlay: true, overlayOptions: { anchor: "center", width: 90, maxHeight: "60%" } },
				);
				return;
			}

			const current = config;
			if (!current) return;
			await ctx.ui.custom(
				(_tui, _theme, _kb, done) =>
					createSettingsComponent({
						config: current,
						onSave: (next) => {
							try {
								writeConfigFile(globalConfigPath, next);
								config = next;
							} catch (err) {
								log(err);
							}
						},
						onDone: () => done(undefined),
					}),
				{ overlay: true, overlayOptions: { anchor: "center", width: 60, maxHeight: "60%" } },
			);
		},
	});
}
