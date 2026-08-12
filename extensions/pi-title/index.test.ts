import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import piTitle from "./index.ts";

type Handler = (event: any, ctx: any) => any;
type Complete = (model: unknown, context: unknown, options: any) => Promise<any>;

// vitest 4 移除了 waitFor：轮询断言直到通过或超时
async function waitFor(check: () => void | Promise<void>, timeout = 1000): Promise<void> {
	const start = Date.now();
	for (;;) {
		try {
			await check();
			return;
		} catch (err) {
			if (Date.now() - start > timeout) throw err;
			await new Promise((done) => setTimeout(done, 20));
		}
	}
}

const dirs: string[] = [];
const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const response = {
	content: [{ type: "text", text: "正确标题" }],
	usage: { input: 10, output: 3, cacheRead: 1000, cacheWrite: 0 },
	stopReason: "stop",
};

function setup(dir: string, completeImpl?: Complete) {
	const handlers = new Map<string, Handler>();
	const commands = new Map<string, { handler: Handler }>();
	let mergedPayload: unknown;
	const complete = vi.fn(
		completeImpl ??
			(async (_model, _context, options) => {
				mergedPayload = options.onPayload({
					model: "model",
					messages: [{ role: "user", content: "标题请求" }],
				});
				return response;
			}),
	);
	const notify = vi.fn();
	const setSessionName = vi.fn();
	const pi = {
		on: vi.fn((event: string, handler: Handler) => handlers.set(event, handler)),
		registerCommand: vi.fn((name: string, command: any) => commands.set(name, command)),
		setSessionName,
	} as unknown as ExtensionAPI;
	let branch: unknown[] = [];
	const ctx = {
		cwd: dir,
		hasUI: true,
		mode: "tui",
		model: { provider: "test", id: "model" },
		modelRegistry: { complete },
		sessionManager: {
			getSessionId: () => "session-1",
			getSessionName: () => undefined,
			getBranch: () => branch,
		},
		ui: { notify, select: vi.fn() },
	};
	piTitle(pi);
	return {
		handlers,
		commands,
		complete,
		ctx,
		notify,
		setSessionName,
		getMerged: () => mergedPayload,
		setMerged: (value: unknown) => {
			mergedPayload = value;
		},
		setBranch: (value: unknown[]) => {
			branch = value;
		},
	};
}

function tempConfig(config: Record<string, unknown> = {}): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-title-"));
	dirs.push(dir);
	process.env.PI_CODING_AGENT_DIR = dir;
	const configDir = join(dir, "extensions", "pi-title");
	mkdirSync(configDir, { recursive: true });
	writeFileSync(join(configDir, "config.json"), JSON.stringify(config));
	return dir;
}

async function captureLive(app: ReturnType<typeof setup>, text = "完整 live 上下文") {
	await app.handlers.get("before_provider_request")?.(
		{ payload: { model: "model", messages: [{ role: "user", content: text }], stream: true } },
		app.ctx,
	);
}

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
	const state = (globalThis as Record<PropertyKey, any>)[
		Symbol.for("@shelken/pi-title/runtime")
	];
	state?.liveBySession.clear();
	state?.jobsBySession.clear();
	state?.pendingFresh.clear();
	state?.gateBySession.clear();
	vi.useRealTimers();
});

describe("pi-title", () => {
	it("restores cache-eligible rounds on reload and triggers immediately", async () => {
		const dir = tempConfig({ roundInterval: 3 });
		const first = setup(dir);
		await first.handlers.get("session_start")?.({ reason: "startup" }, first.ctx);
		await captureLive(first);
		await first.handlers.get("session_shutdown")?.({ reason: "reload" }, first.ctx);

		const second = setup(dir);
		second.setBranch(
			Array.from({ length: 3 }, (_, index) => [
				{
					type: "message",
					timestamp: `2026-08-12T00:0${index}:00.000Z`,
					message: { role: "user", content: [] },
				},
				{
					type: "message",
					timestamp: `2026-08-12T00:0${index}:01.000Z`,
					message: {
						role: "assistant",
						provider: "test",
						model: "model",
						content: [],
						usage: { input: 10, output: 1, cacheRead: 1000, cacheWrite: 0 },
					},
				},
			]).flat(),
		);
		await second.handlers.get("session_start")?.({ reason: "reload" }, second.ctx);
		await waitFor(() => expect(second.complete).toHaveBeenCalledOnce());
	});

	it("keeps the exact live payload across extension reload", async () => {
		const dir = tempConfig();
		const first = setup(dir);
		await first.handlers.get("session_start")?.({ reason: "startup" }, first.ctx);
		await captureLive(first);
		await first.handlers.get("session_shutdown")?.({ reason: "reload" }, first.ctx);

		const second = setup(dir);
		await second.handlers.get("session_start")?.({ reason: "reload" }, second.ctx);
		await second.commands.get("title")?.handler("fresh", second.ctx);
		await waitFor(() => expect(second.complete).toHaveBeenCalledOnce());
		expect(JSON.stringify(second.getMerged())).toContain("完整 live 上下文");
		expect((second.getMerged() as { messages: unknown[] }).messages).toHaveLength(2);
	});

	it("fresh without live payload sends a standalone request immediately", async () => {
		const app = setup(tempConfig());
		await app.handlers.get("session_start")?.({ reason: "startup" }, app.ctx);
		await app.commands.get("title")?.handler("fresh", app.ctx);
		await waitFor(() => expect(app.complete).toHaveBeenCalledOnce());
		// 无 live payload：直接用 provider 自建请求体，不附加对话历史
		expect(JSON.stringify(app.getMerged())).toContain("标题请求");
		expect((app.getMerged() as { messages: unknown[] }).messages).toHaveLength(1);
		await waitFor(() => expect(app.setSessionName).toHaveBeenCalledWith("正确标题"));
		expect(app.notify).toHaveBeenCalledWith('pi-title: 标题已更新为 "正确标题"', "info");
	});

	it("fresh returns immediately and rejects same-session reentry", async () => {
		let resolve!: (value: typeof response) => void;
		const pending = new Promise<typeof response>((done) => {
			resolve = done;
		});
		let app!: ReturnType<typeof setup>;
		app = setup(tempConfig(), async (_model, _context, options) => {
			app.setMerged(
				options.onPayload({ messages: [{ role: "user", content: "标题请求" }] }),
			);
			return pending;
		});
		await app.handlers.get("session_start")?.({ reason: "startup" }, app.ctx);
		await captureLive(app);

		const returned = await Promise.race([
			app.commands.get("title")!.handler("fresh", app.ctx).then(() => true),
			new Promise<boolean>((done) => setTimeout(() => done(false), 50)),
		]);
		expect(returned).toBe(true);
		await app.commands.get("title")?.handler("fresh", app.ctx);
		expect(app.complete).toHaveBeenCalledOnce();
		expect(app.notify).toHaveBeenCalledWith(
			"pi-title: 上一次标题生成尚未完成，已跳过本次触发",
			"warning",
		);
		resolve(response);
		await waitFor(() => expect(app.setSessionName).toHaveBeenCalledWith("正确标题"));
		await waitFor(() =>
			expect(app.notify).toHaveBeenCalledWith('pi-title: 标题已更新为 "正确标题"', "info"),
		);
	});

	it("aborts a stuck title request after 120 seconds and warns", async () => {
		vi.useFakeTimers();
		const app = setup(tempConfig(), async (_model, _context, options) => {
			options.onPayload({ messages: [{ role: "user", content: "标题请求" }] });
			return new Promise(() => {}); // provider 完全忽略 AbortSignal
		});
		await app.handlers.get("session_start")?.({ reason: "startup" }, app.ctx);
		await captureLive(app);
		await app.commands.get("title")?.handler("fresh", app.ctx);
		// bun test 的 vitest 4 缺 advanceTimersByTimeAsync，用同步版 + microtask flush
		vi.advanceTimersByTime(120_000);
		for (let i = 0; i < 10; i++) await Promise.resolve();
		expect(app.notify).toHaveBeenCalledWith(
			"pi-title: 标题生成超时（120s），已放弃本次",
			"warning",
		);
	});

	it("counts only cache-eligible settled rounds toward the interval", async () => {
		const app = setup(tempConfig({ roundInterval: 3 }));
		await app.handlers.get("session_start")?.({ reason: "startup" }, app.ctx);
		const settle = async (input: number, cacheRead: number) => {
			await captureLive(app);
			await app.handlers.get("agent_end")?.(
				{
					messages: [
						{ role: "assistant", usage: { input, output: 1, cacheRead, cacheWrite: 0 } },
					],
				},
				app.ctx,
			);
			await app.handlers.get("agent_settled")?.({}, app.ctx);
		};

		await settle(10, 1000);
		await settle(0, 0); // provider 空 usage 不应消耗自动标题间隔
		await settle(10, 1000);
		expect(app.complete).not.toHaveBeenCalled();
		await settle(10, 1000);
		await waitFor(() => expect(app.complete).toHaveBeenCalledOnce());
	});

	it("does not treat its own title as a manual title", async () => {
		const app = setup(tempConfig({ roundInterval: 1 }));
		await app.handlers.get("session_start")?.({ reason: "startup" }, app.ctx);
		await captureLive(app, "第一轮");
		const agentEnd = {
			messages: [
				{ role: "assistant", usage: { input: 10, output: 1, cacheRead: 1000, cacheWrite: 0 } },
			],
		};
		await app.handlers.get("agent_end")?.(agentEnd, app.ctx);
		await app.handlers.get("agent_settled")?.({}, app.ctx);
		await waitFor(() => expect(app.complete).toHaveBeenCalledTimes(1));
		await app.handlers.get("session_info_changed")?.({ name: "正确标题" }, app.ctx);

		await captureLive(app, "第二轮");
		await app.handlers.get("agent_end")?.(agentEnd, app.ctx);
		await app.handlers.get("agent_settled")?.({}, app.ctx);
		await waitFor(() => expect(app.complete).toHaveBeenCalledTimes(2));
	});
});
