import { describe, expect, it } from "vitest";
import { basename, createPaint, formatTokens, parseGitStatus, promptText, renderBar, renderLastPrompt } from "../src/format.ts";

// 去掉 ANSI，便于断言文字与图标
// oxlint-disable-next-line no-control-regex
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const paint = createPaint((_color, text) => text);

const data = {
  model: "Claude Sonnet 5.5",
  thinking: "high",
  dir: "pi-extensions",
  branch: "main",
  context: { tokens: 169_000, window: 1_000_000, percent: 16.9 },
  cacheRead: 8_400_000,
  cost: 1.934,
};

describe("format", () => {
  it("formatTokens 分档", () => {
    expect([999, 8_400, 169_123, 1_000_000, 8_400_000, 12_000_000].map(formatTokens)).toEqual([
      "999",
      "8.4k",
      "169k",
      "1.0M",
      "8.4M",
      "12M",
    ]);
  });

  it("renderBar 带图标与 powerline 细分隔符，行首只有一个空格", () => {
    const out = strip(renderBar(data, paint));
    expect(out).toBe(
      " \uEC19 Sonnet 5.5 \uE0B1 think:high \uE0B1 \uF115 pi-extensions \uE0B1 \uF1C0 169k/1.0M (16.9%) \uE0B1 \uF126 main \uE0B1 \uF1C0 \uF090 8.4M \uE0B1 $1.93",
    );
  });

  it("缓存与费用为 0 时省略；无分支无上下文时不留空段", () => {
    const out = strip(renderBar({ ...data, cacheRead: 0, cost: 0, branch: null, context: undefined }, paint));
    expect(out).toBe(" \uEC19 Sonnet 5.5 \uE0B1 think:high \uE0B1 \uF115 pi-extensions");
  });

  it("order 决定段与顺序，空 order 不输出任何行", () => {
    expect(strip(renderBar(data, paint, ["dir", "cost"]))).toBe(" \uF115 pi-extensions \uE0B1 $1.93");
    expect(renderBar(data, paint, [])).toBe("");
  });

  it("git 脏状态：分支转黄并追加 *未暂存 +已暂存 ?未跟踪", () => {
    const out = renderBar({ ...data, git: { staged: 1, unstaged: 4, untracked: 2 } }, paint);
    expect(strip(out)).toContain("\uF126 main *4 +1 ?2");
    expect(out).toContain("\x1b[38;2;238;212;159m\uF126 main"); // gitDirty #eed49f
  });

  it("high 思考档逐字彩虹，low 交给 pi 主题", () => {
    const rainbow = renderBar(data, paint);
    expect(rainbow).toContain("\x1b[38;2;178;129;214mt");
    const low = renderBar({ ...data, thinking: "low" }, createPaint((color, text) => `<${color}>${text}`));
    expect(low).toContain("<thinkingLow>think:low");
  });

  it("上下文超过 70% 变黄，超过 90% 变红；未知显示 ?", () => {
    const at = (percent: number) =>
      renderBar({ ...data, context: { tokens: 1, window: 100, percent } }, paint);
    expect(at(80)).toContain("\x1b[38;2;238;212;159m1/100 (80.0%)");
    expect(at(95)).toContain("\x1b[38;2;237;135;150m1/100 (95.0%)");
    const unknown = renderBar({ ...data, context: { tokens: null, window: 200_000, percent: null } }, paint);
    expect(strip(unknown)).toContain("?/200k");
  });

  it("parseGitStatus 区分已暂存、未暂存、未跟踪", () => {
    expect(parseGitStatus(" M a\nM  b\nMM c\n?? d\n?? e\n")).toEqual({ staged: 2, unstaged: 2, untracked: 2 });
    expect(parseGitStatus("")).toEqual({ staged: 0, unstaged: 0, untracked: 0 });
  });

  it("basename 处理尾斜杠", () => {
    expect(basename("/a/b/c/")).toBe("c");
  });

  it("promptText 支持字符串与分段内容", () => {
    expect(promptText("hi")).toBe("hi");
    expect(promptText([{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }])).toBe("a  b");
  });

  it("renderLastPrompt 压缩空白，空提示不渲染", () => {
    const cut = (s: string, w: number) => s.slice(0, w);
    expect(strip(renderLastPrompt("a\n\n  b", 40, cut)[0])).toBe(" ↳ a b");
    expect(renderLastPrompt("  ", 40, cut)).toEqual([]);
  });
});
