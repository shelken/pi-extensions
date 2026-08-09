import type { SessionContext, SessionEntry } from "@earendil-works/pi-coding-agent";

type AgentMessage = SessionContext["messages"][number];
type ContextPruneIndexData = { toolCalls?: Array<{ toolCallId?: string }> };

export function applyContextPruneIndex(
	messages: AgentMessage[],
	entries: SessionEntry[],
): AgentMessage[] {
	const indexedToolCallIds = new Set<string>();
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== "context-prune-index") continue;
		const data = entry.data as ContextPruneIndexData | undefined;
		for (const toolCall of data?.toolCalls ?? []) {
			if (toolCall.toolCallId) indexedToolCallIds.add(toolCall.toolCallId);
		}
	}
	if (indexedToolCallIds.size === 0) return messages;
	return messages.filter(
		(message) => message.role !== "toolResult" || !indexedToolCallIds.has(message.toolCallId),
	);
}
