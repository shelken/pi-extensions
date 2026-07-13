import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  appendHistory,
  loadHistory,
  MAX_HISTORY,
  pushUniqueHistory,
} from "../index.ts";

let tmpDir: string;

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

function historyPath(cwd: string): string {
  return path.join(tmpDir, `${cwd.replace(/\//g, "-")}.jsonl`);
}

describe("folder history", () => {
  it("追加并按 cwd 加载，去重保留最后一次", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cmd-hist-"));
    const cwd = "/tmp/demo-project";

    appendHistory(cwd, "first", tmpDir);
    appendHistory(cwd, "second", tmpDir);
    appendHistory(cwd, "first", tmpDir);

    expect(loadHistory(cwd, tmpDir)).toEqual(["second", "first"]);
  });

  it("不同 cwd 写不同文件", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cmd-hist-"));
    appendHistory("/a", "from-a", tmpDir);
    appendHistory("/b", "from-b", tmpDir);
    expect(loadHistory("/a", tmpDir)).toEqual(["from-a"]);
    expect(loadHistory("/b", tmpDir)).toEqual(["from-b"]);
  });

  it("文件名碰撞时用 cwd 隔离（/a-b vs /a/b）", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cmd-hist-"));
    appendHistory("/a-b", "from-flat", tmpDir);
    appendHistory("/a/b", "from-nested", tmpDir);

    expect(historyPath("/a-b")).toBe(historyPath("/a/b"));
    expect(loadHistory("/a-b", tmpDir)).toEqual(["from-flat"]);
    expect(loadHistory("/a/b", tmpDir)).toEqual(["from-nested"]);

    appendHistory("/a-b", "flat-2", tmpDir);
    expect(loadHistory("/a-b", tmpDir)).toEqual(["from-flat", "flat-2"]);
    expect(loadHistory("/a/b", tmpDir)).toEqual(["from-nested"]);
  });

  it("新写入带 cwd", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cmd-hist-"));
    const cwd = "/tmp/x";
    appendHistory(cwd, "hello", tmpDir);
    const raw = fs.readFileSync(historyPath(cwd), "utf-8");
    const row = JSON.parse(raw.trim()) as Record<string, unknown>;
    expect(row).toEqual({ cwd, text: "hello" });
  });

  it("跳过无 cwd / malformed 行", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cmd-hist-"));
    const cwd = "/tmp/legacy";
    fs.writeFileSync(
      historyPath(cwd),
      [
        JSON.stringify({ cwd, text: "keep-me" }),
        JSON.stringify({ text: "no-cwd" }),
        "not-json",
      ].join("\n") + "\n",
      "utf-8",
    );
    expect(loadHistory(cwd, tmpDir)).toEqual(["keep-me"]);
  });

  it("load 时压缩超限记录，碰撞文件中其他 cwd 保留", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cmd-hist-"));
    const flat = "/a-b";
    const nested = "/a/b";
    expect(historyPath(flat)).toBe(historyPath(nested));

    const seed = [
      ...Array.from({ length: 10 }, (_, i) =>
        JSON.stringify({ cwd: flat, text: `flat-${i}` }),
      ),
      ...Array.from({ length: MAX_HISTORY + 50 }, (_, i) =>
        JSON.stringify({ cwd: nested, text: `old-${i}` }),
      ),
    ];
    fs.writeFileSync(historyPath(nested), seed.join("\n") + "\n", "utf-8");

    const loaded = loadHistory(nested, tmpDir);
    expect(loaded).toHaveLength(MAX_HISTORY);
    expect(loaded[0]).toBe("old-50");
    expect(loaded.at(-1)).toBe(`old-${MAX_HISTORY + 49}`);
    expect(loadHistory(flat, tmpDir)).toHaveLength(10);

    const diskRows = fs
      .readFileSync(historyPath(nested), "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { cwd: string; text: string });
    expect(diskRows.filter((r) => r.cwd === nested)).toHaveLength(MAX_HISTORY);
    expect(diskRows.filter((r) => r.cwd === flat)).toHaveLength(10);
  });

  it("内存去重", () => {
    expect(pushUniqueHistory(["a", "b"], "a")).toEqual(["b", "a"]);
  });
});
