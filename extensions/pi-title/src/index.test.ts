import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import piTitle from "../index.ts";
import { readHistory } from "./history.ts";

describe("/title", () => {
	const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
	let dir = "";

	afterEach(() => {
		if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	it("fresh bypasses automatic gates, preserves warnings, and records its trigger", async () => {
		dir = mkdtempSync(join(tmpdir(), "pi-title-command-"));
		process.env.PI_CODING_AGENT_DIR = dir;
		const configDir = join(dir, "extensions", "pi-title");
		mkdirSync(configDir, { recursive: true });
		writeFileSync(join(configDir, "config.json"), JSON.stringify({ enabled: false }));

		const handlers = new Map<string, (event: unknown, ctx: any) => Promise<void>>();
		const commands = new Map<
			string,
			{
				handler: (args: string, ctx: any) => Promise<void>;
				getArgumentCompletions: (prefix: string) => unknown;
			}
		>();
		const setSessionName = vi.fn();
		const notify = vi.fn();
		const complete = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "Fresh title" }],
			usage: { input: 100, output: 3, cacheRead: 0, cacheWrite: 0 },
			stopReason: "stop",
		});
		const pi = {
			on: vi.fn((event: string, handler: (event: unknown, ctx: any) => Promise<void>) => {
				handlers.set(event, handler);
			}),
			registerCommand: vi.fn((name: string, command: any) => commands.set(name, command)),
			getActiveTools: () => [],
			getAllTools: () => [],
			setSessionName,
		} as unknown as ExtensionAPI;
		const ctx = {
			cwd: dir,
			hasUI: true,
			model: { provider: "test", id: "model" },
			modelRegistry: { complete },
			thinkingLevel: "off",
			getSystemPrompt: () => "system",
			sessionManager: {
				getSessionId: () => "session-1",
				getSessionName: () => "Manual title",
				buildContextEntries: () => [],
				getBranch: () => [],
			},
			ui: { notify },
		};

		piTitle(pi);
		expect([...commands.keys()]).toEqual(["title"]);
		expect(commands.get("title")?.getArgumentCompletions("")).toEqual([
			{ value: "fresh", label: "fresh", description: "立即生成新标题" },
			{ value: "history", label: "history", description: "查看本会话的标题历史" },
			{ value: "config", label: "config", description: "修改 pi-title 配置" },
		]);
		await handlers.get("session_start")?.({}, ctx);
		await commands.get("title")?.handler("fresh", ctx);

		expect(complete).toHaveBeenCalledOnce();
		expect(setSessionName).toHaveBeenCalledWith("Fresh title");
		expect(notify).toHaveBeenCalledWith(
			"pi-title: 自动标题缓存命中率仅 0.0% (低于 95%)",
			"warning",
		);
		expect(readHistory(join(configDir, "history.jsonl"), "session-1")[0]?.triggeredBy).toBe(
			"fresh",
		);
	});
});
