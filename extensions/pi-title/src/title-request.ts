import type { SessionContext, SessionEntry } from "@earendil-works/pi-coding-agent";

type AgentMessage = SessionContext["messages"][number];
type ContextPruneIndexData = { toolCalls?: Array<{ toolCallId?: string }> };
type ContextPruneSummary = AgentMessage & {
	role: "custom";
	customType: "context-prune-summary";
	details?: { toolCallRefs?: Array<{ toolCallId?: string }> };
};

function summaryToolCallIds(message: AgentMessage): string[] | undefined {
	if (message.role !== "custom" || message.customType !== "context-prune-summary") return;
	const refs = (message as ContextPruneSummary).details?.toolCallRefs;
	if (!Array.isArray(refs)) return;
	const ids = refs.flatMap((ref) => (ref.toolCallId ? [ref.toolCallId] : []));
	return ids.length > 0 ? ids : undefined;
}

function findSummaryInsertIndex(messages: AgentMessage[], toolCallIds: string[]): number | undefined {
	const ids = new Set(toolCallIds);
	let coveredAt: number | undefined;
	for (let index = 0; index < messages.length; index++) {
		const message = messages[index];
		if (message.role !== "assistant") continue;
		if (message.content.some((block) => block.type === "toolCall" && ids.has(block.id))) {
			coveredAt = index;
		}
	}
	if (coveredAt === undefined) return;
	let insertAt = coveredAt + 1;
	while (insertAt < messages.length) {
		const next = messages[insertAt];
		if (
			next.role !== "toolResult" &&
			!(next.role === "custom" && next.customType === "context-prune-summary")
		)
			break;
		insertAt++;
	}
	return insertAt;
}

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
	const summaries = messages.flatMap((message) => {
		const toolCallIds = summaryToolCallIds(message);
		return toolCallIds ? [{ message, toolCallIds }] : [];
	});
	const result = messages.filter(
		(message) =>
			(message.role !== "toolResult" || !indexedToolCallIds.has(message.toolCallId)) &&
			summaryToolCallIds(message) === undefined,
	);
	for (const summary of summaries) {
		if (!summary.toolCallIds.every((id) => indexedToolCallIds.has(id))) continue;
		const insertAt = findSummaryInsertIndex(result, summary.toolCallIds);
		if (insertAt !== undefined) result.splice(insertAt, 0, summary.message);
	}
	return result;
}
