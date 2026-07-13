import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  appendHistory,
  loadHistory,
  pushUniqueHistory,
} from "../index.ts";

let tmpDir: string;

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("folder history", () => {
  it("追加并按 cwd 加载，去重保留最后一次", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cmd-hist-"));
    const cwd = "/tmp/demo-project";

    appendHistory(cwd, "first", tmpDir);
    appendHistory(cwd, "second", tmpDir);
    appendHistory(cwd, "first", tmpDir);

    expect(loadHistory(cwd, tmpDir)).toEqual(["second", "first"]);
  });

  it("忽略其他 cwd 的记录", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cmd-hist-"));
    appendHistory("/a", "from-a", tmpDir);
    appendHistory("/b", "from-b", tmpDir);
    expect(loadHistory("/a", tmpDir)).toEqual(["from-a"]);
  });

  it("内存去重", () => {
    expect(pushUniqueHistory(["a", "b"], "a")).toEqual(["b", "a"]);
  });
});
