import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import background from "pi-background/extensions/background.ts";

type Tool = ToolDefinition<any, any>;

// 模型可见文字按工具名覆盖；未列出的字段沿用上游
const TEXT: Record<string, { description?: string; promptGuidelines?: string[]; params?: Record<string, string> }> = {
	bg_run: {
		description: "Start a shell command in the background; returns a job id. On exit you get a message with the exit code and log tail.",
		promptGuidelines: [
			"bg_run: use instead of bash for anything that may take over ~30s (installs, builds, full test suites, downloads, servers, waits) and keep quick checks in bash. Never sleep, poll, redirect output, or use &/nohup to wait for it; the exit message arrives on its own. Pass wake_on only to act before the job ends.",
		],
		params: {
			command: "Shell command",
			cwd: "Working directory (default: session cwd)",
			wake_on: "Regex; also wake you when an output line matches, e.g. 'listening on|ready'",
		},
	},
	bg_status: { params: { id: "Job id, e.g. bg1; omit to list all", lines: "Log lines to show (default 20)" } },
	bg_kill: { params: { id: "Job id, e.g. bg1" } },
};

// 上游给 bash 追加的那条规则；内置 bash 规则原样保留
const AUTO_BACKGROUND = /moves to the background on its own/;
const BASH_RULE = "bash: a command still running after 120s (or its timeout) moves to the background and returns a job id instead of output.";

function lean(tool: Tool): Tool {
	if (tool.name === "bash") {
		return { ...tool, promptGuidelines: tool.promptGuidelines?.map((g) => (AUTO_BACKGROUND.test(g) ? BASH_RULE : g)) };
	}
	const text = TEXT[tool.name];
	if (!text) return tool;
	const properties = (tool.parameters as any).properties;
	for (const [name, description] of Object.entries(text.params ?? {})) {
		if (properties[name]) properties[name].description = description;
	}
	return {
		...tool,
		...(text.description && { description: text.description }),
		...(text.promptGuidelines && { promptGuidelines: text.promptGuidelines }),
	};
}

export default function (pi: ExtensionAPI): void {
	const leanPi = new Proxy(pi, {
		get(target, property) {
			if (property === "registerTool") return (tool: Tool) => target.registerTool(lean(tool));
			const member = Reflect.get(target, property, target);
			return typeof member === "function" ? member.bind(target) : member;
		},
	});
	background(leanPi);
}
