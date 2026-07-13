import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  buildContextInjection,
  collectSkillPaths,
  cwdHash,
  dirExists,
  getTempStatePath,
  invalidateContextCache,
  readFileSafe,
  readTempState,
  removeTempState,
  resolveDir,
  scanDirContext,
  writeTempState,
  type AddedDir,
} from "../helpers.ts";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-add-dir-test-"));
  invalidateContextCache();
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  removeTempState(tmpRoot);
  invalidateContextCache();
});

function write(rel: string, content: string): string {
  const full = path.join(tmpRoot, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
  return full;
}

describe("resolveDir / dirExists / readFileSafe", () => {
  it("解析相对路径并识别目录", () => {
    const sub = path.join(tmpRoot, "proj");
    fs.mkdirSync(sub);
    expect(dirExists(sub)).toBe(true);
    expect(resolveDir("proj", tmpRoot)).toBe(fs.realpathSync(sub));
    expect(dirExists(path.join(tmpRoot, "missing"))).toBe(false);
  });

  it("展开 ~ 为 home 目录", () => {
    const home = os.homedir();
    expect(resolveDir("~", tmpRoot)).toBe(fs.realpathSync(home));
    // 即使 cwd 里没有 nix-config，也不应拼成 cwd/~/...
    const withTilde = resolveDir("~/Code", tmpRoot);
    expect(withTilde.startsWith(home)).toBe(true);
    expect(withTilde).not.toContain("~");
  });

  it("readFileSafe 读不到返回 null", () => {
    const f = write("a.txt", "hi");
    expect(readFileSafe(f)).toBe("hi");
    expect(readFileSafe(path.join(tmpRoot, "nope"))).toBeNull();
  });
});

describe("temp state", () => {
  it("按 cwd hash 读写状态", () => {
    const dirs: AddedDir[] = [
      { absolutePath: "/tmp/x", label: "x", addedAt: 1 },
    ];
    writeTempState(tmpRoot, dirs);
    expect(getTempStatePath(tmpRoot)).toContain(cwdHash(tmpRoot));
    expect(readTempState(tmpRoot)).toEqual(dirs);
    removeTempState(tmpRoot);
    expect(readTempState(tmpRoot)).toEqual([]);
  });
});

describe("scanDirContext / collectSkillPaths", () => {
  it("读取 AGENTS/CLAUDE 与 skills", () => {
    write("AGENTS.md", "root agents");
    write(".pi/AGENTS.md", "pi agents");
    write("CLAUDE.md", "claude");
    write(".agents/skills/foo/SKILL.md", "---\ndescription: Foo skill\n---\nbody");

    const ctx = scanDirContext(tmpRoot);
    expect(ctx.agentsMd).toContain("root agents");
    expect(ctx.agentsMd).toContain("pi agents");
    expect(ctx.claudeMd).toBe("claude");
    expect(ctx.skills.get("foo")).toContain("Foo skill");
    expect(ctx.skillPaths.get("foo")).toContain("SKILL.md");

    const paths = collectSkillPaths([
      { absolutePath: tmpRoot, label: "t", addedAt: 1 },
    ]);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain("foo");
  });
});

describe("buildContextInjection", () => {
  it("注入外部目录上下文并缓存", () => {
    write("AGENTS.md", "hello agents");
    const dirs: AddedDir[] = [
      { absolutePath: tmpRoot, label: "demo", addedAt: 1 },
    ];

    const first = buildContextInjection(dirs);
    expect(first).toContain("External Directories");
    expect(first).toContain("hello agents");
    expect(first).toContain(tmpRoot);

    const second = buildContextInjection(dirs);
    expect(second).toBe(first);

    invalidateContextCache();
    write("AGENTS.md", "changed");
    const third = buildContextInjection(dirs);
    expect(third).toContain("changed");
  });

  it("空列表返回空串", () => {
    expect(buildContextInjection([])).toBe("");
  });
});
