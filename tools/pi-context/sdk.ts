// 不调用模型，用 pi SDK 在空 agentDir 中加载扩展，统计系统提示词增量与工具 schema 字符数。
// 无 UI 时隐藏工具的扩展（如 rpiv-ask-user-question）在 `pi -p` 下测不到，靠这里补。
// NOBIND=1 跳过 session_start，让这类扩展保持工具可见。
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { createAgentSession, DefaultResourceLoader, SessionManager } = await import(
	join(process.env.PI_PKG!, "dist/index.js")
);

const agentDir = mkdtempSync(join(tmpdir(), "pi-context-agent-"));
const cwd = mkdtempSync(join(tmpdir(), "pi-context-cwd-"));

async function measure(paths: string[]) {
	const loader = new DefaultResourceLoader({
		cwd,
		agentDir,
		additionalExtensionPaths: paths,
		noSkills: true,
		noPromptTemplates: true,
		noContextFiles: true,
	});
	await loader.reload();
	const { session } = await createAgentSession({ resourceLoader: loader, sessionManager: SessionManager.inMemory(), cwd, agentDir });
	if (!process.env.NOBIND) await session.bindExtensions?.({});
	const active = new Set(session.getActiveToolNames());
	const schema: Record<string, number> = {};
	for (const t of session.getAllTools()) {
		if (active.has(t.name)) schema[t.name] = JSON.stringify({ name: t.name, description: t.description, parameters: t.parameters }).length;
	}
	const prompt = session.systemPrompt.length;
	session.dispose();
	return { prompt, schema };
}

const base = await measure([]);
for (const spec of process.argv.slice(2)) {
	const [label, path] = spec.includes("=") ? spec.split(/=(.*)/s) : [spec, spec];
	const r = await measure([path]);
	const tools: Record<string, number> = {};
	for (const [n, c] of Object.entries(r.schema)) {
		const d = c - (base.schema[n] ?? 0);
		if (d !== 0) tools[base.schema[n] === undefined ? n : `${n}Δ`] = d;
	}
	const schema = Object.values(tools).reduce((a, b) => a + b, 0);
	const prompt = r.prompt - base.prompt;
	console.log(JSON.stringify({ label, chars: prompt + schema, prompt, schema, tools }));
}
process.exit(0);
