/**
 * 扩展加载与工厂测试。
 *
 * 模拟用户启用扩展那一刻：pi 读根 package.json 的 pi.extensions，
 * jiti import 每个入口再调用 default(pi)。
 *
 * Layer 1 (load)：入口能 import 且 default 是 function。
 *   捕获 missing module、export 形式被改坏。
 * Layer 2 (factory)：mock pi 调 default 不抛。
 *   捕获工厂顶层缺方法、顶层 await 网络/IO（AGENTS.md 严禁）。
 *
 * 入口只读根 pi.extensions（与 monorepo 路径引入场景一致）。
 * 单独引入子包时 pi 才读子包自己的 pi.extensions——不在本测试范围。
 *
 * vitest 默认用 oxc transformer，不读 tsconfig.json 的 paths 字段。
 * 这点让 simple-plannotator 的 .d.ts shim 不被当模块加载（bun test 会，
 * 因为 bun 读 tsconfig paths）——所以本测试必须用 vitest 而非 bun test。
 */
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");

async function loadEntries(): Promise<Array<{ name: string; path: string }>> {
	const cfg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
	const rels: string[] = cfg.pi?.extensions ?? [];
	return rels.map((rel) => {
		// rel 形如 "./extensions/<pkg>/..."；取第三段作子包名
		const name = rel.split("/")[2];
		return { name, path: join(ROOT, rel) };
	});
}

const entries = await loadEntries();

function mockPi() {
	const noop = () => {};
	const ctx = {
		ui: {
			notify: noop,
			confirm: async () => true,
			input: async () => "",
			select: async () => undefined as unknown,
		},
		cwd: process.cwd(),
	};
	const pi = {
		on: noop,
		registerCommand: noop,
		registerTool: noop,
		registerProvider: noop,
		registerShortcut: noop,
		appendEntry: noop,
		sendUserMessage: noop,
		sendMessage: noop,
		getAllTools: () => [],
		getModel: () => ({}),
		setModel: noop,
		setActiveTools: noop,
		exec: noop,
		render: noop,
		newSession: noop,
		fork: noop,
		switchSession: noop,
		reload: async () => {},
		exit: noop,
		approve: noop,
		setSessionName: noop,
	};
	return { pi, ctx };
}

describe("extensions", () => {
	for (const { name, path } of entries) {
		describe(name, () => {
			it("entry loads and exports default function", async () => {
				const mod = await import(pathToFileURL(path).href);
				expect(typeof mod.default).toBe("function");
			});

			it("factory runs without throwing", async () => {
				const mod = await import(pathToFileURL(path).href);
				const { pi, ctx } = mockPi();
				let err: unknown = undefined;
				try {
					const result = mod.default(pi as any, ctx as any);
					if (result && typeof (result as any).then === "function") {
						await result;
					}
				} catch (e) {
					err = e;
				}
				expect(err).toBeUndefined();
			});
		});
	}
});
