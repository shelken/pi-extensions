import { describe, expect, it } from "vitest";
import { convertToLlm } from "@earendil-works/pi-coding-agent";
import { applyContextPruneIndex } from "./title-request.ts";

describe("title request prefix fidelity", () => {
	it("convertToLlm turns custom messages into user messages (live-round parity)", () => {
		// Live rounds pass custom messages (context-prune summary, web-search results)
		// through convertToLlm before hitting the provider. The title request must do
		// the same: providers like codebuddy drop unknown roles (role "custom"),
		// which busts the cache prefix at the first custom message.
		const custom = {
			role: "custom",
			customType: "context-prune-summary",
			content: [{ type: "text", text: "<summary>内容</summary>" }],
			timestamp: Date.now(),
		};
		const converted = convertToLlm([custom as never]);
		expect(converted[0].role).toBe("user");
		expect(converted[0].content).toEqual([{ type: "text", text: "<summary>内容</summary>" }]);
	});

	it("convertToLlm turns bashExecution into user messages", () => {
		const bash = {
			role: "bashExecution",
			content: [{ type: "text", text: "ls -la" }],
			timestamp: Date.now(),
		};
		const converted = convertToLlm([bash as never]);
		expect(converted[0].role).toBe("user");
	});

	it("convertToLlm leaves normal user/assistant/toolResult untouched", () => {
		const user = { role: "user", content: [{ type: "text", text: "继续" }], timestamp: 1 };
		const converted = convertToLlm([user as never]);
		expect(converted[0].role).toBe("user");
	});

	it("removes tool results recorded by context-prune", () => {
		const indexed = { role: "toolResult", toolCallId: "call-indexed" };
		const retained = { role: "toolResult", toolCallId: "call-retained" };
		const messages = [{ role: "user" }, indexed, retained, { role: "assistant" }];
		const entries = [
			{
				type: "custom",
				customType: "context-prune-index",
				data: { toolCalls: [{ toolCallId: "call-indexed" }] },
			},
		];

		expect(applyContextPruneIndex(messages as never[], entries as never[])).toEqual([
			messages[0],
			retained,
			messages[3],
		]);
	});

	it("relocates a committed summary before the context_prune housekeeping call", () => {
		const coveredAssistant = {
			role: "assistant",
			content: [{ type: "toolCall", id: "call-covered", name: "bash", arguments: {} }],
		};
		const coveredResult = { role: "toolResult", toolCallId: "call-covered" };
		const housekeepingAssistant = {
			role: "assistant",
			content: [{ type: "toolCall", id: "call-prune", name: "context_prune", arguments: {} }],
		};
		const housekeepingResult = { role: "toolResult", toolCallId: "call-prune" };
		const summary = {
			role: "custom",
			customType: "context-prune-summary",
			content: "summary",
			details: { toolCallRefs: [{ shortId: "t1", toolCallId: "call-covered" }] },
		};
		const user = { role: "user", content: "continue" };
		const messages = [
			coveredAssistant,
			coveredResult,
			housekeepingAssistant,
			housekeepingResult,
			summary,
			user,
		];
		const entries = [
			{
				type: "custom",
				customType: "context-prune-index",
				data: { toolCalls: [{ toolCallId: "call-covered" }] },
			},
		];

		expect(applyContextPruneIndex(messages as never[], entries as never[])).toEqual([
			coveredAssistant,
			summary,
			housekeepingAssistant,
			housekeepingResult,
			user,
		]);
	});

	it("keeps messages unchanged without a context-prune index", () => {
		const messages = [{ role: "user" }, { role: "toolResult", toolCallId: "call-1" }];
		expect(applyContextPruneIndex(messages as never[], [])).toEqual(messages);
	});
});
