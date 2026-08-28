import {
	appendFileSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
	CONFIG_DIR_NAME,
	getAgentDir,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Api, AssistantMessage, Context, Model, UserMessage } from "@earendil-works/pi-ai";

const TITLE_TIMEOUT_MS = 120_000;
const MAX_DUMPS = 10;
const RUNTIME_KEY = Symbol.for("@shelken/pi-title/runtime");
const DEFAULT_PROMPT =
	"现在不要操作其他任务。总结当前对话的实际任务，精炼成一个合适的标题；如果当前任务与最开始的任务独立无关，只总结最新任务。标题使用当前对话语言，仅输出标题文本，不超过 {maxTitleLength} 个字，不要调用工具。";

interface TitleConfig {
	enabled: boolean;
	roundInterval: number;
	customPrompt: string;
	overrideManual: boolean;
	maxTitleLength: number;
	cacheThreshold: number;
	warnThreshold: number;
	debug: boolean;
}

interface Usage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

interface HistoryEntry {
	sessionId: string;
	time: string;
	title: string;
	rawTitle: string;
	cached: boolean;
	cacheRead: number;
	cacheWrite: number;
	inputTokens: number;
	outputTokens: number;
	cacheHitRate: number;
	model: string;
	provider: string;
	triggeredBy: "auto" | "fresh";
}

interface GateState {
	rounds: number;
	lastHitRate: number;
	lastModel?: string;
	manualTitle: boolean;
	lastSetTitle?: string;
}

interface TitleJob {
	controller: AbortController;
	triggeredBy: HistoryEntry["triggeredBy"];
}

interface RuntimeState {
	liveBySession: Map<string, unknown>;
	jobsBySession: Map<string, TitleJob>;
	pendingFresh: Set<string>;
	gateBySession: Map<string, GateState>;
}

const DEFAULT_CONFIG: TitleConfig = {
	enabled: true,
	roundInterval: 3,
	customPrompt: DEFAULT_PROMPT,
	overrideManual: false,
	maxTitleLength: 35,
	cacheThreshold: 0.5,
	warnThreshold: 0.95,
	debug: false,
};

// SAFETY: 在 globalThis 上共享跨 reload 的运行时状态；symbol 键避免与宿主属性冲突，reload 后复用同一对象
const runtime = ((globalThis as typeof globalThis & { [key: symbol]: RuntimeState })[RUNTIME_KEY] ??= {
	liveBySession: new Map(),
	jobsBySession: new Map(),
	pendingFresh: new Set(),
	gateBySession: new Map(),
});

function modelKey(model: Model<Api>): string {
	return `${model.provider}/${model.id}`;
}

function hitRate(usage: Pick<Usage, "input" | "cacheRead" | "cacheWrite">): number {
	const total = usage.input + usage.cacheRead + usage.cacheWrite;
	return total > 0 ? usage.cacheRead / total : 0;
}

type ConfigLayer = Partial<TitleConfig>;

function isBoolean(v: any): v is boolean {
  return typeof v === "boolean";
}

function isPositiveInteger(v: any): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function isNumber(v: any): v is number {
  return typeof v === "number";
}

function isNonEmptyString(v: any): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function isObjectLike(v: any): v is object {
  return v !== null && typeof v === "object";
}

// 配置字段逐项宽容校验：非法字段忽略、其余字段生效（与既有行为一致）；typeof 集中在守卫内
function readConfigLayer(path: string): ConfigLayer | undefined {
	try {
		const value = JSON.parse(readFileSync(path, "utf8"));
		return isObjectLike(value) ? value : undefined;
	} catch {
		return undefined;
	}
}

function loadConfig(globalPath: string, projectPath?: string): TitleConfig {
	const config = { ...DEFAULT_CONFIG };
	for (const layer of [readConfigLayer(globalPath), projectPath ? readConfigLayer(projectPath) : undefined]) {
		if (!layer) continue;
		if (isBoolean(layer.enabled)) config.enabled = layer.enabled;
		if (isPositiveInteger(layer.roundInterval)) config.roundInterval = layer.roundInterval;
		if (isNonEmptyString(layer.customPrompt)) config.customPrompt = layer.customPrompt;
		if (isBoolean(layer.overrideManual)) config.overrideManual = layer.overrideManual;
		if (isPositiveInteger(layer.maxTitleLength)) config.maxTitleLength = layer.maxTitleLength;
		if (isNumber(layer.cacheThreshold))
			config.cacheThreshold = Math.min(1, Math.max(0, layer.cacheThreshold));
		if (isNumber(layer.warnThreshold))
			config.warnThreshold = Math.min(1, Math.max(0, layer.warnThreshold));
		if (isBoolean(layer.debug)) config.debug = layer.debug;
	}
	return config;
}

function writeConfig(path: string, config: TitleConfig): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}

function appendHistory(path: string, entry: HistoryEntry): void {
	mkdirSync(dirname(path), { recursive: true });
	appendFileSync(path, `${JSON.stringify(entry)}\n`);
}

// history.jsonl 由本扩展 appendHistory 写入；守卫校验消费字段（sessionId/title），其余字段信任自写文件
function isHistoryEntry(value: any): value is HistoryEntry {
	if (typeof value !== "object" || value === null) return false;
	return typeof value.sessionId === "string" && typeof value.title === "string";
}

function readHistory(path: string, sessionId: string): HistoryEntry[] {
	try {
		return readFileSync(path, "utf8")
			.split("\n")
			.flatMap((line) => {
				try {
					const entry = JSON.parse(line);
					return isHistoryEntry(entry) && entry.sessionId === sessionId ? [entry] : [];
				} catch {
					return [];
				}
			})
			.reverse();
	} catch {
		return [];
	}
}

function writeLog(line: string): void {
	try {
		const dir = join(getAgentDir(), "logs");
		mkdirSync(dir, { recursive: true });
		appendFileSync(join(dir, "pi-title.log"), `[${new Date().toISOString()}] ${line}\n`);
	} catch {
		// Diagnostics must not break title generation.
	}
}

function writeDump(
	sessionId: string,
	meta: Omit<HistoryEntry, "sessionId" | "rawTitle" | "cached">,
	// live/title payload 形状由 provider 决定，此处仅透传序列化到磁盘、不消费内容
	livePayload: any,
	titlePayload: any,
	usage: Usage,
): void {
	const dir = join(getAgentDir(), "logs", "pi-title-miss");
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `miss-${meta.time.replace(/[:.]/g, "-")}-${sessionId.slice(0, 8)}.json`),
		JSON.stringify({ meta: { ...meta, sessionId, titleUsage: usage }, livePayload, titlePayload }),
	);
	const files = readdirSync(dir).filter((file) => file.startsWith("miss-")).sort();
	while (files.length > MAX_DUMPS) rmSync(join(dir, files.shift()!));
}

function findMessages(payload: any): unknown[] | undefined {
	if (!isObjectLike(payload) || Array.isArray(payload)) return undefined;
	// SAFETY: isObjectLike 已排除 null/标量；字段名固定为 messages/contents/input，缺失即 undefined
	const rec = payload as any;
	for (const field of ["messages", "contents", "input"]) {
		if (Array.isArray(rec[field])) return rec[field];
	}
	return undefined;
}

function normalizeTitle(raw: string): string {
	return raw.trim().replace(/^[\s"'“”‘’「」『』《》]+|[\s"'“”‘’「」『』《》]+$/g, "").trim();
}

function formatTime(iso: string): string {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

// branch 来自 pi 内部事件消息流；守卫只校验消费字段，其余字段信任 SDK 消息结构
type GateEntry = { timestamp?: string; type?: string; message?: { role?: string } };

function isGateEntry(value: any): value is GateEntry {
	if (typeof value !== "object" || value === null) return false;
	return (
		(value.timestamp === undefined || typeof value.timestamp === "string") &&
		(value.type === undefined || typeof value.type === "string") &&
		(value.message === undefined ||
			(typeof value.message === "object" && value.message !== null))
	);
}

function restoreGate(
	branch: readonly unknown[],
	currentTitle: string | undefined,
	lastHistory: HistoryEntry | undefined,
	config: TitleConfig,
	currentModel: string | undefined,
): GateState {
	const generated = currentTitle !== undefined && currentTitle === lastHistory?.title;
	const state: GateState = {
		rounds: 0,
		lastHitRate: 0,
		manualTitle: currentTitle !== undefined && !generated,
		lastSetTitle: generated ? currentTitle : undefined,
	};
	const since = lastHistory ? Date.parse(lastHistory.time) : 0;
	let sawUser = false;
	let lastAssistant: AssistantMessage | undefined;
	const finishRound = () => {
		if (!lastAssistant) return;
		const model = `${lastAssistant.provider}/${lastAssistant.model}`;
		if (model !== currentModel) {
			state.rounds = 0;
			state.lastModel = model;
			state.lastHitRate = 0;
			return;
		}
		const rate = hitRate(lastAssistant.usage);
		state.lastHitRate = rate;
		state.lastModel = model;
		if (rate >= config.cacheThreshold) state.rounds += 1;
	};

	for (const value of branch) {
		if (!isGateEntry(value)) continue;
		if (value.type !== "message" || (value.timestamp && Date.parse(value.timestamp) <= since)) continue;
		if (value.message?.role === "user") {
			if (sawUser) finishRound();
			sawUser = true;
			lastAssistant = undefined;
		} else if (sawUser && value.message?.role === "assistant") {
			// SAFETY: role==="assistant" 的消息必有 provider/model/usage（pi 消息契约）
			lastAssistant = value.message as AssistantMessage;
		}
	}
	if (sawUser) finishRound();
	return state;
}

function gateAllows(state: GateState, config: TitleConfig, currentModel: string): boolean {
	return (
		config.enabled &&
		state.rounds >= config.roundInterval &&
		state.lastHitRate >= config.cacheThreshold &&
		state.lastModel === currentModel &&
		(!state.manualTitle || config.overrideManual)
	);
}

export default function piTitle(pi: ExtensionAPI): void {
	let config = { ...DEFAULT_CONFIG };
	let historyPath = "";
	let globalConfigPath = "";

	const reportError = (ctx: ExtensionContext, triggeredBy: HistoryEntry["triggeredBy"], cause: unknown) => {
		const message = cause instanceof Error ? cause.message : String(cause);
		writeLog(`[title-error] ${message}`);
		if (triggeredBy === "fresh") ctx.ui.notify(`pi-title: 标题生成失败：${message}`, "error");
	};

	const startTitle = (ctx: ExtensionContext, triggeredBy: HistoryEntry["triggeredBy"]): void => {
		if (!ctx.model) return;
		const sid = ctx.sessionManager.getSessionId();
		if (runtime.jobsBySession.has(sid)) {
			if (triggeredBy === "fresh")
				ctx.ui.notify("pi-title: 上一次标题生成尚未完成，已跳过本次触发", "warning");
			return;
		}
		const live = runtime.liveBySession.get(sid);
		if (!live && triggeredBy !== "fresh") return;

		if (triggeredBy === "fresh") runtime.pendingFresh.delete(sid);
		const liveSnapshot = structuredClone(live);
		const model = ctx.model;
		const titleConfig = { ...config };
		const titleHistoryPath = historyPath;
		const controller = new AbortController();
		const job: TitleJob = { controller, triggeredBy };
		runtime.jobsBySession.set(sid, job);
		runtime.gateBySession.get(sid)!.rounds = 0;

		void (async () => {
			let mergedPayload: unknown;
			const aborted = new Promise<never>((_resolve, reject) => {
				controller.signal.addEventListener(
					"abort",
					() => reject(new Error(`标题请求已中止：${String(controller.signal.reason)}`)),
					{ once: true },
				);
			});
			const timer = setTimeout(() => controller.abort("timeout"), TITLE_TIMEOUT_MS);
			try {
				const titleMessage: UserMessage = {
					role: "user",
					content: titleConfig.customPrompt.replaceAll(
						"{maxTitleLength}",
						String(titleConfig.maxTitleLength),
					),
					timestamp: Date.now(),
				};
				const context: Context = { systemPrompt: "", messages: [titleMessage], tools: [] };
				const request = ctx.modelRegistry.complete(model, context, {
					sessionId: sid,
					cacheRetention: "short",
					signal: controller.signal,
					onPayload: (builtPayload: any) => {
						// pi SDK 回调契约；payload 形状由 provider 决定，仅在其中查找消息列表
						const titleMessages = findMessages(builtPayload);
						if (!titleMessages?.length) {
							throw new Error("provider payload 不含消息列表");
						}
						// 无 live payload 时直接用 provider 自建请求体，不附加对话历史
						if (liveSnapshot === undefined) {
							mergedPayload = builtPayload;
							return builtPayload;
						}
						const liveMessages = findMessages(liveSnapshot);
						if (!liveMessages) {
							throw new Error("provider payload 不含可合并的消息列表");
						}
						mergedPayload = structuredClone(liveSnapshot);
						findMessages(mergedPayload)!.push(titleMessages[titleMessages.length - 1]);
						return mergedPayload;
					},
				});
				const result = await Promise.race([request, aborted]);
				if (mergedPayload === undefined) throw new Error("provider 未执行 onPayload，已拒绝标题结果");
				if (result.stopReason === "error")
					throw new Error(result.errorMessage ?? "模型请求失败但未返回错误信息");

				const rawTitle = result.content
					.filter((part): part is { type: "text"; text: string } => part.type === "text")
					.map((part) => part.text)
					.join("");
				const title = normalizeTitle(rawTitle);
				if (!title) throw new Error("模型未返回标题文本");
				if (title.includes("\n")) throw new Error("模型返回了多行内容而不是标题");

				// SAFETY: complete() 返回结构的 usage 即 Usage（tokens + 缓存计数），SDK 契约保证字段存在
				const usage = result.usage as Usage;
				const rate = hitRate(usage);
				const time = new Date().toISOString();
				writeLog(
					`[title-res] model=${modelKey(model)} usage=${JSON.stringify(usage)} hitRate=${rate} title=${JSON.stringify(title)}`,
				);
				if (rate < titleConfig.warnThreshold) {
					ctx.ui.notify(
						`pi-title: 自动标题缓存命中率仅 ${(rate * 100).toFixed(1)}% (低于 ${(titleConfig.warnThreshold * 100).toFixed(0)}%)`,
						"warning",
					);
				}
				if (titleConfig.debug) {
					try {
						writeDump(
							sid,
							{
								time,
								title,
								cacheRead: usage.cacheRead,
								cacheWrite: usage.cacheWrite,
								inputTokens: usage.input,
								outputTokens: usage.output,
								cacheHitRate: rate,
								model: modelKey(model),
								provider: model.provider,
								triggeredBy,
							},
							liveSnapshot,
							mergedPayload,
							usage,
						);
					} catch (err) {
						writeLog(`[dump-error] ${String(err)}`);
					}
				}

				const gate = runtime.gateBySession.get(sid)!;
				if (triggeredBy === "auto" && gate.manualTitle && !titleConfig.overrideManual) return;
				const entry: HistoryEntry = {
					sessionId: sid,
					time,
					title,
					rawTitle,
					cached: usage.cacheRead > 0,
					cacheRead: usage.cacheRead,
					cacheWrite: usage.cacheWrite,
					inputTokens: usage.input,
					outputTokens: usage.output,
					cacheHitRate: rate,
					model: modelKey(model),
					provider: model.provider,
					triggeredBy,
				};
				try {
					appendHistory(titleHistoryPath, entry);
				} catch (err) {
					writeLog(`[history-error] ${String(err)}`);
				}
				gate.lastSetTitle = title;
				pi.setSessionName(title);
				if (triggeredBy === "fresh") {
					ctx.ui.notify(`pi-title: 标题已更新为 "${title}"`, "info");
				}
			} catch (err) {
				if (controller.signal.aborted) {
					if (controller.signal.reason === "timeout") {
						writeLog(`[title-timeout] ${String(err)}`);
						ctx.ui.notify(
							`pi-title: 标题生成超时（${TITLE_TIMEOUT_MS / 1000}s），已放弃本次`,
							"warning",
						);
					}
					return;
				}
				reportError(ctx, triggeredBy, err);
			} finally {
				clearTimeout(timer);
				if (runtime.jobsBySession.get(sid) === job) runtime.jobsBySession.delete(sid);
			}
		})();
	};

	pi.on("session_start", async (event, ctx) => {
		const sid = ctx.sessionManager.getSessionId();
		const agentDir = getAgentDir();
		historyPath = join(agentDir, "extensions", "pi-title", "history.jsonl");
		globalConfigPath = join(agentDir, "extensions", "pi-title", "config.json");
		config = loadConfig(
			globalConfigPath,
			ctx.cwd ? join(ctx.cwd, CONFIG_DIR_NAME, "extensions", "pi-title", "config.json") : undefined,
		);
		if (event.reason !== "reload") {
			runtime.liveBySession.delete(sid);
			runtime.pendingFresh.delete(sid);
		}
		const latest = readHistory(historyPath, sid)[0];
		const gate = restoreGate(
			ctx.sessionManager.getBranch(),
			ctx.sessionManager.getSessionName(),
			latest,
			config,
			ctx.model ? modelKey(ctx.model) : undefined,
		);
		runtime.gateBySession.set(sid, gate);
		if (config.debug) {
			writeLog(
				`[gate-restore] sid=${sid.slice(0, 8)} reason=${event.reason} rounds=${gate.rounds} hitRate=${gate.lastHitRate} model=${gate.lastModel ?? "-"} manual=${gate.manualTitle}`,
			);
		}
		if (
			event.reason === "reload" &&
			ctx.model &&
			runtime.liveBySession.has(sid) &&
			gateAllows(gate, config, modelKey(ctx.model))
		) {
			startTitle(ctx, "auto");
		}
	});

	pi.on("session_shutdown", async (event, ctx) => {
		const sid = ctx.sessionManager.getSessionId();
		const job = runtime.jobsBySession.get(sid);
		if (job) {
			if (event.reason === "reload" && job.triggeredBy === "fresh") runtime.pendingFresh.add(sid);
			job.controller.abort(event.reason);
			runtime.jobsBySession.delete(sid);
		}
		if (event.reason !== "reload") {
			runtime.liveBySession.delete(sid);
			runtime.pendingFresh.delete(sid);
			runtime.gateBySession.delete(sid);
		}
	});

	pi.on("session_info_changed", async (event, ctx) => {
		const gate = runtime.gateBySession.get(ctx.sessionManager.getSessionId());
		if (!gate) return;
		if (event.name === undefined) {
			gate.manualTitle = false;
			gate.lastSetTitle = undefined;
		} else if (event.name !== gate.lastSetTitle) {
			gate.manualTitle = true;
		}
	});

	pi.on("model_select", async (event, ctx) => {
		if (!event.previousModel || modelKey(event.previousModel) === modelKey(event.model)) return;
		const sid = ctx.sessionManager.getSessionId();
		runtime.liveBySession.delete(sid);
		const gate = runtime.gateBySession.get(sid);
		if (gate) {
			gate.rounds = 0;
			gate.lastModel = undefined;
		}
	});

	pi.on("thinking_level_select", async (_event, ctx) => {
		runtime.liveBySession.delete(ctx.sessionManager.getSessionId());
	});

	pi.on("before_provider_request", async (event, ctx) => {
		try {
			const payload = structuredClone(event.payload);
			runtime.liveBySession.set(ctx.sessionManager.getSessionId(), payload);
			if (config.debug) {
				writeLog(
					`[live-payload] sid=${ctx.sessionManager.getSessionId().slice(0, 8)} messages=${findMessages(payload)?.length ?? 0}`,
				);
			}
		} catch (err) {
			writeLog(`[live-payload-error] ${String(err)}`);
		}
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!ctx.model) return;
		const assistant = [...event.messages]
			.reverse()
			.find((message): message is AssistantMessage => message.role === "assistant");
		const usage = assistant?.usage;
		const gate = runtime.gateBySession.get(ctx.sessionManager.getSessionId());
		if (!gate) return;
		const rate = hitRate({
			input: usage?.input ?? 0,
			cacheRead: usage?.cacheRead ?? 0,
			cacheWrite: usage?.cacheWrite ?? 0,
		});
		gate.lastHitRate = rate;
		gate.lastModel = modelKey(ctx.model);
		if (rate >= config.cacheThreshold) gate.rounds += 1;
	});

	pi.on("agent_settled", async (_event, ctx) => {
		if (!ctx.model || !ctx.hasUI) return;
		const sid = ctx.sessionManager.getSessionId();
		if (runtime.pendingFresh.has(sid)) {
			if (!runtime.jobsBySession.has(sid)) {
				runtime.pendingFresh.delete(sid);
				startTitle(ctx, "fresh");
			}
			return;
		}
		const gate = runtime.gateBySession.get(sid);
		if (config.debug && gate) {
			writeLog(
				`[gate-settled] sid=${sid.slice(0, 8)} rounds=${gate.rounds} hitRate=${gate.lastHitRate} model=${gate.lastModel ?? "-"} current=${modelKey(ctx.model)} manual=${gate.manualTitle}`,
			);
		}
		if (gate && gateAllows(gate, config, modelKey(ctx.model))) startTitle(ctx, "auto");
	});

	const editConfig = async (ctx: ExtensionContext): Promise<void> => {
		const choices = [
			`enabled: ${config.enabled}`,
			`roundInterval: ${config.roundInterval}`,
			`maxTitleLength: ${config.maxTitleLength}`,
			`cacheThreshold: ${config.cacheThreshold}`,
			`warnThreshold: ${config.warnThreshold}`,
			`overrideManual: ${config.overrideManual}`,
			`debug: ${config.debug}`,
			`customPrompt: ${config.customPrompt === DEFAULT_PROMPT ? "默认" : "自定义"}`,
		];
		const selected = await ctx.ui.select("pi-title 配置", choices);
		if (!selected) return;
		// SAFETY: key 截取自上方 choices 列表（每项均为 “键: 值” 格式）
		const key = selected.slice(0, selected.indexOf(":")) as keyof TitleConfig;
		const values = {
			enabled: ["true", "false"],
			roundInterval: ["1", "2", "3", "5", "8", "10"],
			customPrompt: ["恢复默认提示词"],
			overrideManual: ["true", "false"],
			maxTitleLength: ["10", "15", "20", "30", "35", "50"],
			cacheThreshold: ["0.3", "0.5", "0.7", "0.9", "0.95", "1"],
			warnThreshold: ["0.5", "0.7", "0.9", "0.95", "1"],
			debug: ["true", "false"],
		};
		const value = await ctx.ui.select(key, values[key]);
		if (!value) return;
		if (key === "customPrompt") config.customPrompt = DEFAULT_PROMPT;
		else if (["enabled", "overrideManual", "debug"].includes(key)) {
			// SAFETY: 上方布尔键枚举与 choices/values 定义一致
			(config[key] as boolean) = value === "true";
		} else {
			// SAFETY: 其余键均为数字类型配置（customPrompt 已单独处理）
			(config[key] as number) = Number(value);
		}
		writeConfig(globalConfigPath, config);
	};

	pi.registerCommand("title", {
		description: "生成标题、查看历史或修改配置。",
		getArgumentCompletions: (prefix) => {
			const commands = ["fresh", "history", "config"];
			const matches = commands.filter((command) => command.startsWith(prefix.trim().toLowerCase()));
			return matches.length ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const command = args.trim().toLowerCase();
			if (!command) {
				const title = ctx.sessionManager.getSessionName();
				ctx.ui.notify(title ? `pi-title: 当前标题 "${title}"` : "pi-title: 当前会话还没有标题", "info");
				return;
			}
			if (!ctx.model && command === "fresh") {
				ctx.ui.notify("pi-title: 当前没有可用模型", "error");
				return;
			}
			if (command === "fresh") {
				startTitle(ctx, "fresh");
				return;
			}
			if (command === "history") {
				const entries = readHistory(historyPath, ctx.sessionManager.getSessionId());
				if (!entries.length) ctx.ui.notify("pi-title: 当前会话还没有标题历史", "info");
				else
					await ctx.ui.select(
						"pi-title 历史",
						entries.slice(0, 50).map((entry) => {
							const rate = entry.cacheHitRate === undefined ? "-" : `${(entry.cacheHitRate * 100).toFixed(1)}%`;
							return `${formatTime(entry.time)}  ${entry.title}  ${rate}  ${entry.model}`;
						}),
					);
				return;
			}
			if (command === "config") {
				await editConfig(ctx);
				return;
			}
			ctx.ui.notify("用法：/title [fresh|history|config]", "error");
		},
	});
}
