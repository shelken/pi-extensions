import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import statusBar from "../src/index.ts";

function asApi(stub: any): ExtensionAPI {
  // SAFETY: 测试桩只实现被测路径调用的方法，经单次断言收敛到 ExtensionAPI
  return stub as ExtensionAPI;
}

const theme = { fg: (_tone: string, text: string) => text };
// oxlint-disable-next-line no-control-regex
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const tui = { requestRender: vi.fn() };

async function setup(entries: any[]) {
  const handlers = new Map<string, (...args: any[]) => void>();
  const pi = asApi({
    on: (name: string, fn: (...args: any[]) => void) => handlers.set(name, fn),
    getThinkingLevel: () => "high",
    exec: async () => ({ code: 0, stdout: " M a\n?? b\n", stderr: "" }),
  });
  const widgets = new Map<string, { factory: any; options?: any }>();
  const ctx = {
    hasUI: true,
    cwd: "/work/demo",
    model: { name: "Demo" },
    getContextUsage: () => ({ tokens: 1000, contextWindow: 100_000, percent: 1 }),
    sessionManager: { getBranch: () => entries },
    ui: {
      setFooter: (factory: any) => factory(tui, theme, { getGitBranch: () => "main", onBranchChange: () => () => {}, getExtensionStatuses: () => new Map() }),
      setWidget: (key: string, factory: any, options?: any) => widgets.set(key, { factory, options }),
    },
  };
  statusBar(pi);
  handlers.get("session_start")!({}, ctx);
  await Promise.resolve();
  const render = (key: string, width = 120) => widgets.get(key)!.factory(tui, theme).render(width);
  return { handlers, widgets, render };
}

const assistant = (id: string, cacheRead: number, cost: number) => ({
  id,
  type: "message",
  message: { role: "assistant", usage: { cacheRead, cost: { total: cost } } },
});

describe("pi-status-bar", () => {
  it("状态条累加缓存读与费用，并带 git 脏状态", async () => {
    const { render } = await setup([assistant("a", 1000, 0.5), assistant("b", 2000, 0.25)]);
    const [line] = render("status-bar");
    expect(strip(line)).toBe(
      " \uEC19 Demo \uE0B1 think:high \uE0B1 \uF115 demo \uE0B1 \uF126 main *1 ?1 \uE0B1 \uF1C0 1.0k/100k (1.0%) \uE0B1 \uF1C0 \uF090 3.0k \uE0B1 $0.75",
    );
  });

  it("上一条提示来自会话分支，并随新用户消息更新；放在编辑器下方", async () => {
    const { handlers, widgets, render } = await setup([
      { id: "u", type: "message", message: { role: "user", content: "第一条\n提示" } },
    ]);
    expect(render("status-bar-last-prompt").map(strip)).toEqual([" ↳ 第一条 提示"]);
    handlers.get("message_start")!({ message: { role: "user", content: "第二条" } });
    expect(render("status-bar-last-prompt").map(strip)).toEqual([" ↳ 第二条"]);
    expect(widgets.get("status-bar-last-prompt")!.options).toEqual({ placement: "belowEditor" });
  });
});
