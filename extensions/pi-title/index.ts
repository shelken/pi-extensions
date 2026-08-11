import { join } from "node:path";
import {
	buildSessionContext,
	getAgentDir,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type {
	Api,
	AssistantMessage,
	Context,
	Model,
	Tool,
	UserMessage,
} from "@earendil-works/pi-ai";
import { resolveConfig, writeConfigFile, type TitleConfig } from "./src/config.ts";
import { logTitle } from "./src/diagnose.ts";
import { appendHistory, readHistory, type HistoryEntry } from "./src/history.ts";
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

/**
 * 在 provider 请求体里定位"消息列表"字段（messages / contents 等）。
 * 通用 shape 判断：数组且首元素含 role 字段——覆盖 openai / anthropic / bedrock / google。
 * 不按 provider 名枚举，新 provider 自动适配。
 */
function findMessageList(payload: unknown): { field: string; messages: unknown[] } | undefined {
	if (typeof payload !== "object" || payload === null) return;
	for (const [field, value] of Object.entries(payload as Record<string, unknown>)) {
		if (
			Array.isArray(value) &&
			value.length > 0 &&
			typeof value[0] === "object" &&
			value[0] !== null &&
			"role" in (value[0] as object)
		) {
			return { field, messages: value as unknown[] };
		}
	}
	return undefined;
}

export default function piTitle(pi: ExtensionAPI): void {
	let config: TitleConfig | undefined;
	let state: GateState = initialState();
	let historyPath = "";
	let globalConfigPath = "";
	let inFlight = false;
	// 最近一次 live 请求的完整 provider payload，按 sessionId 隔离。
	// 标题请求复用此 payload（末尾追加标题消息），使缓存前缀与 live 字节级一致。
	// 标题请求走 complete→stream，不经 sdk 的 onPayload，不触发 before_provider_request，
	// 故此 handler 只会捕到 live，无需标志位区分。
	const livePayloadBySession = new Map<string, unknown>();

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
		livePayloadBySession.delete(ctx.sessionManager.getSessionId());
	});

	pi.on("session_info_changed", async (event) => {
		state = onSessionInfoChanged(state, event.name);
	});

	pi.on("model_select", async () => {
		state = onModelChange(state);
	});

	pi.on("before_provider_request", async (event, ctx) => {
		livePayloadBySession.set(ctx.sessionManager.getSessionId(), structuredClone(event.payload));
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!ctx.model) return;
		const lastAssistant = [...event.messages]
			.reverse()
			.find((m): m is AssistantMessage => m.role === "assistant");
		const usage = lastAssistant?.usage;
		logTitle(
			`[agent_end] model=${modelKey(ctx.model)} usage=${JSON.stringify({ input: usage?.input, output: usage?.output, cacheRead: usage?.cacheRead, cacheWrite: usage?.cacheWrite })} sysLen=${ctx.getSystemPrompt()?.length ?? -1} tools=${[...pi.getActiveTools()].sort().join(",")}`,
		);
		const roundUsage = {
			cacheRead: usage?.cacheRead ?? 0,
			cacheWrite: usage?.cacheWrite ?? 0,
			input: usage?.input ?? 0,
		};
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
			const titleMessage: UserMessage = {
				role: "user",
				content: buildTitlePrompt(config.customPrompt, config.maxTitleLength),
				timestamp: Date.now(),
			};
			const activeNames = new Set(pi.getActiveTools());
			const tools = pi.getAllTools().filter((t) => activeNames.has(t.name)) as Tool[];
			// context 仅用于让 buildParams 构造本 provider 格式的标题消息（onPayload 会取末尾
			// 追加到 live payload）。前缀内容由 live payload 提供，无需重建会话消息。
			const context: Context = {
				systemPrompt: ctx.getSystemPrompt(),
				messages: [titleMessage],
				tools,
			};
			const sid = ctx.sessionManager.getSessionId();
			// complete 走 ModelRuntime.prepareRequest：自动注入 auth（env/凭据），
			// 与主会话同一认证链路（08-08 排查结论，不可退回 provider.streamSimple）。
			const result = await ctx.modelRegistry.complete(ctx.model, context, {
				sessionId: sid,
				cacheRetention: "short",
				onPayload: (titlePayload: unknown) => {
					// 复用 live 请求体：顶层字段（thinking/reasoning_effort/max_tokens/
					// temperature/stream/prompt_cache_key/……任何 provider 任何字段）字节级保留，
					// 只在消息列表末尾追加 buildParams 构造的标题消息（已是该 provider 正确格式）。
					// 这样缓存前缀与 live 一致，命中；不依赖逐字段枚举，新 provider 自动覆盖。
					const live = livePayloadBySession.get(sid);
					if (!live) return undefined; // 无 live 缓存，退化用 buildParams 产物原样
					const merged = structuredClone(live);
					const liveList = findMessageList(merged);
					const titleList = findMessageList(titlePayload);
					if (liveList && titleList && titleList.messages.length > 0) {
						liveList.messages.push(titleList.messages[titleList.messages.length - 1]);
					}
					return merged;
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
			logTitle(
				`[title-res] model=${modelKey(ctx.model)} raw=${JSON.stringify(text.slice(0, 300))} usage=${JSON.stringify({ input: usage.input, output: usage.output, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite })} hitRate=${hitRate} title=${JSON.stringify(title)} stop=${result.stopReason}`,
			);
			if (hitRate < config.warnThreshold) {
				ctx.ui.notify(
					`pi-title: 自动标题缓存命中率仅 ${(hitRate * 100).toFixed(1)}% (低于 ${(config.warnThreshold * 100).toFixed(0)}%)`,
					"warning",
				);
			}
			const entry: HistoryEntry = {
				sessionId: sid,
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
