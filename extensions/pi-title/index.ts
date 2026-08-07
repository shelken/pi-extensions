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
import { buildTitlePrompt, normalizeTitle } from "./src/title.ts";

function modelKey(model: Model<Api>): string {
	return `${model.provider}/${model.id}`;
}

export default function piTitle(pi: ExtensionAPI): void {
	let config: TitleConfig | undefined;
	let state: GateState = initialState();
	let historyPath = "";
	let globalConfigPath = "";
	let inFlight = false;

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

	pi.on("agent_end", async (event, ctx) => {
		if (!ctx.model) return;
		const lastAssistant = [...event.messages]
			.reverse()
			.find((m): m is AssistantMessage => m.role === "assistant");
		const usage = lastAssistant?.usage;
		state = onAgentEnd(
			state,
			{
				cacheRead: usage?.cacheRead ?? 0,
				cacheWrite: usage?.cacheWrite ?? 0,
				input: usage?.input ?? 0,
			},
			modelKey(ctx.model),
		);
	});

	pi.on("agent_settled", async (_event, ctx) => {
		if (!ctx.hasUI || !config || !ctx.model || inFlight) return;
		if (!shouldTrigger(state, config, modelKey(ctx.model))) return;
		state = onTriggered(state);
		void generateTitle(ctx).catch(log);
	});

	async function generateTitle(ctx: ExtensionContext): Promise<void> {
		if (!config || !ctx.model) return;
		const provider = ctx.modelRegistry.getProvider(ctx.model.provider);
		if (!provider) return;
		inFlight = true;
		try {
			const { messages } = buildSessionContext(ctx.sessionManager.buildContextEntries());
			const titleMessage: UserMessage = {
				role: "user",
				content: buildTitlePrompt(config.customPrompt, config.maxTitleLength),
				timestamp: Date.now(),
			};
			const activeNames = new Set(pi.getActiveTools());
			const tools = pi.getAllTools().filter((t) => activeNames.has(t.name)) as Tool[];
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
			const stream = provider.streamSimple(ctx.model, context, {
				sessionId: ctx.sessionManager.getSessionId(),
				cacheRetention: "short",
				...(ctx.thinkingLevel ? { reasoning: ctx.thinkingLevel as ThinkingLevel } : {}),
			});
			const result = await stream.result();
			const text = result.content
				.filter((c): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text)
				.join("");
			const title = normalizeTitle(text, config.maxTitleLength);
			const usage = result.usage;
			const hitRate = computeHitRate({
				cacheRead: usage.cacheRead,
				cacheWrite: usage.cacheWrite,
				input: usage.input,
			});
			// Low cache-hit on the title request itself: the prefix didn't carry over.
			// Warn every time — no rate limit (user's explicit choice).
			if (hitRate < config.warnThreshold) {
				ctx.ui.notify(
					`pi-title: 自动标题缓存命中率仅 ${(hitRate * 100).toFixed(1)}% (低于 ${(config.warnThreshold * 100).toFixed(0)}%)`,
					"warning",
				);
			}
			const entry: HistoryEntry = {
				sessionId: ctx.sessionManager.getSessionId(),
				time: new Date().toISOString(),
				title,
				cached: usage.cacheRead > 0,
				cacheRead: usage.cacheRead,
				cacheWrite: usage.cacheWrite,
				inputTokens: usage.input,
				outputTokens: usage.output,
				cacheHitRate: hitRate,
				model: modelKey(ctx.model),
				provider: ctx.model.provider,
				triggeredBy: "auto",
			};
			try {
				appendHistory(historyPath, entry);
			} catch (err) {
				log(err);
			}
			if (!title) return;
			if (state.userManuallyTitled && !config.overrideManual) return;
			// Record our write BEFORE setSessionName: setSessionName synchronously
			// emits session_info_changed, whose handler runs before the line after
			// this call — without the pre-record, the handler sees our own name as
			// foreign and locks userManuallyTitled, killing all future triggers.
			state = onTitleSet(state, title);
			pi.setSessionName(title);
		} finally {
			inFlight = false;
		}
	}

	pi.registerCommand("title-history", {
		description: "Show this session's auto-title history (cache hits, tokens, model).",
		handler: async (_args, ctx) => {
			const entries = readHistory(historyPath, ctx.sessionManager.getSessionId());
			await ctx.ui.custom(
				(_tui, _theme, _kb, done) => createHistoryComponent(entries, () => done(undefined)),
				{ overlay: true, overlayOptions: { anchor: "center", width: 90, maxHeight: "60%" } },
			);
		},
	});

	pi.registerCommand("title-settings", {
		description: "Edit pi-title configuration (writes to global config.json).",
		handler: async (_args, ctx) => {
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
