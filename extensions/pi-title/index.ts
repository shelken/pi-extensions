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
	Message,
	Model,
	ThinkingLevel,
	Tool,
	UserMessage,
} from "@earendil-works/pi-ai";
import { resolveConfig, writeConfigFile, type TitleConfig } from "./src/config.ts";
import { appendHistory, readHistory, type HistoryEntry } from "./src/history.ts";
import { createHistoryTable } from "./src/history-ui.ts";
import { createSettingsComponent } from "./src/settings-ui.ts";
import {
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
import type { SettingsListTheme } from "@earendil-works/pi-tui";
import { buildTitlePrompt, normalizeTitle } from "./src/title.ts";

const WIDGET_HISTORY = "pi-title-history";
const WIDGET_SETTINGS = "pi-title-settings";

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
		state = onAgentEnd(state, lastAssistant?.usage.cacheRead ?? 0, modelKey(ctx.model));
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
				// Cast for cache-prefix fidelity: pass the exact AgentMessage[] the live round
				// serializes (same provider client), rather than filtering to Message[] which
				// could diverge from the live prefix and bust the cache. Any unserializable
				// entry surfaces as cacheRead=0, recorded in history for audit.
				messages: [...(messages as unknown as Message[]), titleMessage],
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
			const entry: HistoryEntry = {
				sessionId: ctx.sessionManager.getSessionId(),
				time: new Date().toISOString(),
				title,
				cached: usage.cacheRead > 0,
				cacheRead: usage.cacheRead,
				cacheWrite: usage.cacheWrite,
				inputTokens: usage.input,
				outputTokens: usage.output,
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
			pi.setSessionName(title);
			state = onTitleSet(state, title);
		} finally {
			inFlight = false;
		}
	}

	pi.registerCommand("title-history", {
		description: "Show this session's auto-title history (cache hits, tokens, model).",
		handler: async (_args, ctx) => {
			const entries = readHistory(historyPath, ctx.sessionManager.getSessionId());
			ctx.ui.setWidget(WIDGET_HISTORY, () =>
				createHistoryTable(entries, () => ctx.ui.setWidget(WIDGET_HISTORY, undefined)),
			);
		},
	});

	pi.registerCommand("title-settings", {
		description: "Edit pi-title configuration (writes to global config.json).",
		handler: async (_args, ctx) => {
			const current = config;
			if (!current) return;
			ctx.ui.setWidget(WIDGET_SETTINGS, (_tui, theme) => {
				const settingsTheme: SettingsListTheme = {
					label: (text, sel) => theme.fg(sel ? "accent" : "text", text),
					value: (text, sel) => theme.fg(sel ? "accent" : "muted", text),
					description: (text) => theme.fg("dim", text),
					cursor: theme.fg("accent", "❯"),
					hint: (text) => theme.fg("dim", text),
				};
				return createSettingsComponent({
					config: current,
					theme: settingsTheme,
					onSave: (next) => {
						try {
							writeConfigFile(globalConfigPath, next);
							config = next;
						} catch (err) {
							log(err);
						}
					},
					onDone: () => ctx.ui.setWidget(WIDGET_SETTINGS, undefined),
				});
			});
		},
	});
}
