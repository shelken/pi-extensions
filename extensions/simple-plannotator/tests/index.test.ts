import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import simplePlannotator from "../src/index.ts";

let decision: () => Promise<{ feedback?: string }>;

vi.mock("@plannotator/pi-extension/plannotator-browser", () => {
  const session = () => ({
    url: "http://x",
    stop() {},
    waitForDecision: () => decision(),
  });
  return {
    hasPlanBrowserHtml: () => true,
    hasReviewBrowserHtml: () => true,
    getStartupErrorMessage: (e: unknown) => String(e),
    getLastAssistantMessageText: () => "last",
    startCodeReviewBrowserSession: async () => session(),
    startMarkdownAnnotationSession: async () => session(),
    startLastMessageAnnotationSession: async () => session(),
  };
});

function asApi(stub: any): ExtensionAPI {
  // SAFETY: 测试桩只实现被测路径调用的方法，经单次断言收敛到 ExtensionAPI
  return stub as ExtensionAPI;
}

describe("simple-plannotator extension", () => {
  it("registers its annotation commands", () => {
    const commands: string[] = [];
    const pi = asApi({
      registerCommand: vi.fn((command: string) => commands.push(command)),
    });

    simplePlannotator(pi);

    expect(commands).toEqual(["pnr", "pna", "pnl"]);
  });

  describe("session replaced before the browser decision arrives", () => {
    const unhandled = vi.fn();

    afterEach(() => {
      process.off("unhandledRejection", unhandled);
      unhandled.mockClear();
    });

    async function runPnr() {
      const handlers = new Map<string, (...args: any[]) => Promise<void>>();
      const sendUserMessage = vi.fn(() => {
        throw new Error("stale");
      });
      const pi = asApi({
        registerCommand: (name: string, def: any) =>
          handlers.set(name, def.handler),
        sendUserMessage,
      });
      // 启动阶段的第一次 notify 正常，之后模拟会话已被替换
      let calls = 0;
      const ctx = {
        cwd: process.cwd(),
        ui: {
          notify: vi.fn(() => {
            if (++calls > 1) throw new Error("stale");
          }),
        },
      };

      simplePlannotator(pi);
      process.on("unhandledRejection", unhandled);
      await handlers.get("pnr")!("", ctx);
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      return { sendUserMessage };
    }

    it("会话替换后提交反馈不抛出未处理 rejection", async () => {
      decision = () => Promise.resolve({ feedback: "fix it" });

      const { sendUserMessage } = await runPnr();

      expect(unhandled).not.toHaveBeenCalled();
      expect(sendUserMessage).toHaveBeenCalledTimes(1);
    });

    it("会话替换后浏览器会话出错也不抛出未处理 rejection", async () => {
      decision = () => Promise.reject(new Error("boom"));

      await runPnr();

      expect(unhandled).not.toHaveBeenCalled();
    });
  });
});
