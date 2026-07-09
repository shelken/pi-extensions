import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType, VERSION } from "@earendil-works/pi-coding-agent";
import {
	createCommitHookDirectory,
	removeCommitHookDirectory,
	wrapBashWithCommitHook,
} from "../lib/commit.ts";

export default function (pi: ExtensionAPI) {
	let hooksDir: string | undefined;

	function ensureHooksDir(): string {
		hooksDir ??= createCommitHookDirectory();
		return hooksDir;
	}

	pi.on("session_start", async () => {
		ensureHooksDir();
	});

	pi.on("session_shutdown", async () => {
		removeCommitHookDirectory(hooksDir);
		hooksDir = undefined;
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("bash", event)) return;

		const model = ctx.model;
		const modelName = model ? (model.name || `${model.provider}/${model.id}`) : "unknown";

		event.input.command = wrapBashWithCommitHook(
			event.input.command,
			ensureHooksDir(),
			modelName,
			VERSION,
		);
	});
}
