import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, getAgentDir, isToolCallEventType, VERSION } from "@earendil-works/pi-coding-agent";
import {
	createCommitHookDirectory,
	removeCommitHookDirectory,
	wrapBashWithCommitHook,
} from "./commit.ts";
import { resolveCoAuthorEmail, resolveGeneratorName, resolveHostVersion } from "./config.ts";
import { isGitCommitCommand } from "./git-commit.ts";

export default function (pi: ExtensionAPI) {
	let hooksDir: string | undefined;
	let cachedHostVersion: string | undefined;

	function ensureHooksDir(): string {
		hooksDir ??= createCommitHookDirectory();
		return hooksDir;
	}

	pi.on("session_start", async () => {
		ensureHooksDir();
	});

	pi.on("session_shutdown", async () => {
		removeCommitHookDirectory(hooksDir);
		cachedHostVersion = undefined;
		hooksDir = undefined;
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("bash", event)) return;
		// 只包装直接执行的 git commit；其他命令原样放行，避免影响其他扩展
		if (!isGitCommitCommand(event.input.command)) return;

		const model = ctx.model;
		const modelName = model ? (model.name || `${model.provider}/${model.id}`) : "unknown";

		const generatorName = resolveGeneratorName(CONFIG_DIR_NAME);
		const coAuthorEmail = resolveCoAuthorEmail(CONFIG_DIR_NAME, getAgentDir());
		cachedHostVersion ??= resolveHostVersion(generatorName, VERSION);

		event.input.command = wrapBashWithCommitHook(
			event.input.command,
			ensureHooksDir(),
			modelName,
			cachedHostVersion,
			{
				generatorName,
				coAuthorEmail,
			},
		);
	});
}
