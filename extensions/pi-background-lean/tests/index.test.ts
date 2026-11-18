import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createAgentSession, DefaultResourceLoader, SessionManager } from "@earendil-works/pi-coding-agent";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const LEAN = resolve(import.meta.dirname, "../src/index.ts");
const UPSTREAM = resolve(import.meta.dirname, "../node_modules/pi-background/extensions/background.ts");

// 真实加载：与 pi 启动时一致地注册工具并触发 session_start（pi-background 在这里包装 bash）
async function load(paths: string[]) {
	const agentDir = mkdtempSync(join(tmpdir(), "bg-lean-agent-"));
	const cwd = mkdtempSync(join(tmpdir(), "bg-lean-cwd-"));
	const loader = new DefaultResourceLoader({ cwd, agentDir, additionalExtensionPaths: paths, noSkills: true, noPromptTemplates: true, noContextFiles: true });
	await loader.reload();
	const { session } = await createAgentSession({ resourceLoader: loader, sessionManager: SessionManager.inMemory(), cwd, agentDir });
	await session.bindExtensions({});
	return session;
}

// 相对空载的系统提示词增量 + bg 工具 schema
const footprint = (session: Awaited<ReturnType<typeof load>>) =>
	session.systemPrompt.length - empty.systemPrompt.length +
	session.getAllTools()
		.filter((t) => t.name.startsWith("bg_"))
		.reduce((n, t) => n + JSON.stringify({ description: t.description, parameters: t.parameters }).length, 0);

let lean: Awaited<ReturnType<typeof load>>;
let upstream: Awaited<ReturnType<typeof load>>;
let empty: Awaited<ReturnType<typeof load>>;
beforeAll(async () => {
	[lean, upstream, empty] = [await load([LEAN]), await load([UPSTREAM]), await load([])];
});
afterAll(() => {
	for (const s of [lean, upstream, empty]) s?.dispose();
});

describe("pi-background-lean", () => {
	it("保留上游全部工具与 bash 包装", () => {
		expect(lean.getActiveToolNames()).toEqual(expect.arrayContaining(["bg_run", "bg_status", "bg_kill", "bash"]));
		expect(lean.getAllTools().find((t) => t.name === "bash")?.sourceInfo.path).not.toMatch(/^builtin:/);
		const params = lean.getToolDefinition("bg_run")?.parameters as any;
		expect(Object.keys(params.properties)).toEqual(["command", "cwd", "wake_on"]);
	});

	it("模型可见文字不到上游的 40%", () => {
		expect(footprint(lean)).toBeLessThan(footprint(upstream) * 0.4);
	});

	it("保留模型必须知道的行为", () => {
		const prompt = lean.systemPrompt;
		expect(prompt).toMatch(/bg_run/);
		expect(prompt).toMatch(/120/);
		expect(prompt).not.toMatch(/torch, tensorflow/);
		const wakeOn = (lean.getToolDefinition("bg_run")?.parameters as any).properties.wake_on.description;
		expect(wakeOn).toMatch(/regex/i);
	});
});
