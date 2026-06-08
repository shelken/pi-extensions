import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { containsGitCommit, wrapGitWithTrailers } from "./commit.ts";

const MODEL_NAME = "Model O'Clock";
const PI_VERSION = "0.75.5";
const CO_AUTHOR = `Co-Authored-By: ${MODEL_NAME} <noreply@pi.dev>`;
const GENERATED_BY = `Generated-By: pi ${PI_VERSION}`;

function runInGitRepo(script: string): string {
	const cwd = mkdtempSync(join(tmpdir(), "pi-co-authored-by-"));
	try {
		const wrapped = wrapGitWithTrailers(script, MODEL_NAME, PI_VERSION);
		const setup = `
set -euo pipefail
command git init -q
command git config user.name Tester
command git config user.email tester@example.com
`;

		return execFileSync("bash", ["-lc", `${setup}\n${wrapped}`], {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function countOccurrences(text: string, needle: string): number {
	return text.split(needle).length - 1;
}

describe("containsGitCommit", () => {
	// === 基本检测 ===

	it("detects direct git commit commands", () => {
		expect(containsGitCommit('git commit -m "fix bug"')).toBe(true);
	});

	it("detects heredoc commit commands", () => {
		expect(containsGitCommit("git commit -F - <<'EOF'\nmessage\nEOF")).toBe(true);
	});

	it("detects commit with git global options", () => {
		expect(
			containsGitCommit('git -c commit.gpgsign=false commit -m "fix"'),
		).toBe(true);
	});

	// === RTK 重写: rtk 把 `git commit` 改成 `rtk git commit` ===

	it("detects rtk-rewritten git commit", () => {
		expect(containsGitCommit('rtk git commit -m "test"')).toBe(true);
	});

	it("detects rtk-rewritten git commit with global options", () => {
		expect(containsGitCommit('rtk git -c commit.gpgsign=false commit -m "test"')).toBe(true);
	});

	// === 前导空格/缩进（LLM 可能生成带缩进的命令） ===

	it("detects git commit with leading whitespace", () => {
		expect(containsGitCommit('  git commit -m "test"')).toBe(true);
	});

	// === 多行命令（git 在第二行，\n 分隔） ===

	it("detects git commit on a new line after another command", () => {
		expect(containsGitCommit("cd /tmp\ngit commit -m test")).toBe(true);
	});

	// === -m heredoc 格式（LLM 用 $(cat <<'EOF'...) 传多行消息） ===

	it("detects -m with heredoc command substitution", () => {
		expect(containsGitCommit('git commit -m "$(cat <<\'EOF\'\ntest message\nEOF\n)"')).toBe(true);
	});

	// === -m heredoc 带 rtk 前缀 ===

	it("detects rtk-rewritten -m with heredoc", () => {
		expect(containsGitCommit('rtk git commit -m "$(cat <<\'EOF\'\ntest message\nEOF\n)"')).toBe(true);
	});

	// === shellCommandPrefix 场景 ===

	it("detects git commit after shellCommandPrefix", () => {
		const prefix = 'eval "$(\\${HOME}/.nix-profile/bin/direnv export bash 2>/dev/null)"; ';
		expect(containsGitCommit(prefix + 'git commit -m "test"')).toBe(true);
	});

	it("detects rtk git commit after shellCommandPrefix", () => {
		const prefix = 'eval "$(\\${HOME}/.nix-profile/bin/direnv export bash 2>/dev/null)"; ';
		expect(containsGitCommit(prefix + 'rtk git commit -m "test"')).toBe(true);
	});

	// === 不能误匹配 ===

	it("rejects commands without a commit", () => {
		expect(containsGitCommit("git status --short")).toBe(false);
		expect(containsGitCommit("")).toBe(false);
	});

	it("rejects non-commit git commands followed by unrelated commit text", () => {
		expect(containsGitCommit("git diff -- README.md; echo commit")).toBe(false);
		expect(containsGitCommit("git status --short && printf '%s\\n' commit")).toBe(false);
	});

	it("rejects echo containing git commit", () => {
		expect(containsGitCommit("echo git commit")).toBe(false);
	});

	it("rejects git log", () => {
		expect(containsGitCommit("git log --oneline")).toBe(false);
	});
});

describe("wrapGitWithTrailers", () => {
	it("generates a wrapper without fragile case terminators", () => {
		const wrapped = wrapGitWithTrailers("git commit -m subject", MODEL_NAME, PI_VERSION);

		expect(wrapped).not.toContain(";;");
		expect(wrapped).not.toMatch(/^\s*case\b/m);
	});

	it("passes through non-commit git commands before a commit", () => {
		const output = runInGitRepo(`
git --version
echo one > a.txt
git add a.txt
git commit -q -m 'subject after passthrough'
git log -1 --format=%B
`);

		expect(output).toContain("git version");
		expect(output).toContain("subject after passthrough");
		expect(output).toContain(CO_AUTHOR);
		expect(output).toContain(GENERATED_BY);
	});

	it("appends trailers to a simple commit and passes through later git commands", () => {
		const output = runInGitRepo(`
echo one > a.txt
git add a.txt
git commit -q -m 'simple subject'
git status --short
git log -1 --format=%B
`);

		expect(output).toContain("simple subject");
		expect(output).toContain(CO_AUTHOR);
		expect(output).toContain(GENERATED_BY);
	});

	it("appends trailers to a heredoc commit in a compound script", () => {
		const output = runInGitRepo(`
echo one > a.txt
git add a.txt
git commit -q -F - <<'EOF'
heredoc subject

heredoc body
EOF
git status --short
git log -1 --format=%B
`);

		expect(output).toContain("heredoc subject");
		expect(output).toContain("heredoc body");
		expect(output).toContain(CO_AUTHOR);
		expect(output).toContain(GENERATED_BY);
	});

	it("does not duplicate trailers when amending without editing", () => {
		const output = runInGitRepo(`
echo one > a.txt
git add a.txt
git commit -q -F - <<'EOF'
amend subject

Co-Authored-By: Human <human@example.com>
EOF
git commit -q --amend --no-edit
git log -1 --format=%B
`);

		expect(countOccurrences(output, CO_AUTHOR)).toBe(1);
		expect(countOccurrences(output, GENERATED_BY)).toBe(1);
		expect(output).toContain("Co-Authored-By: Human <human@example.com>");
	});

	it("inserts trailers before the pathspec separator", () => {
		const output = runInGitRepo(`
echo base > base.txt
git add base.txt
git commit -q -m base
echo change >> base.txt
echo only > only.txt
git add base.txt only.txt
git commit -q -m 'pathspec subject' -- only.txt
git log -1 --name-only --format=%B
printf '%s\n' '--- status ---'
git status --short
`);

		expect(output).toContain("pathspec subject");
		expect(output).toContain(CO_AUTHOR);
		expect(output).toContain(GENERATED_BY);
		expect(output).toContain("only.txt");
		expect(output).toContain("M  base.txt");
	});

	it("leaves explicit command git invocations untouched", () => {
		const output = runInGitRepo(`
echo one > a.txt
command git add a.txt
command git commit -q -m 'explicit subject'
command git log -1 --format=%B
`);

		expect(output).toContain("explicit subject");
		expect(output).not.toContain(CO_AUTHOR);
		expect(output).not.toContain(GENERATED_BY);
	});

	it("handles git global options before the commit subcommand", () => {
		const output = runInGitRepo(`
echo one > a.txt
git add a.txt
git -c commit.gpgsign=false commit -q -m 'global option subject'
git log -1 --format=%B
`);

		expect(output).toContain("global option subject");
		expect(output).toContain(CO_AUTHOR);
		expect(output).toContain(GENERATED_BY);
	});

	// 变更原因：RTK 把 `git commit` 重写为 `rtk git commit`，wrapper 需要去掉 rtk 前缀才能拦截。
	it("strips rtk prefix so git() wrapper can intercept", () => {
		const wrapped = wrapGitWithTrailers('rtk git commit -m "test"', MODEL_NAME, PI_VERSION);
		// 包装后的命令不应该以 rtk 开头（wrapper 定义后面的部分）
		const cmdLine = wrapped.split("\n").pop()!;
		expect(cmdLine).toMatch(/^git commit/);
		expect(cmdLine).not.toMatch(/^rtk/);
	});

	// 变更原因：RTK 改写后的命令可能以 `export RTK_DB_PATH=...;` 开头，
	// `rtk` 在命令中间。wrapper 必须去掉 rtk 前缀才能拦截。
	it("strips rtk prefix when RTK_DB_PATH export precedes the command", () => {
		const rtkCmd = "export RTK_DB_PATH='/tmp/test.db'; cd /tmp && rtk git commit -m \"test\"";
		const wrapped = wrapGitWithTrailers(rtkCmd, MODEL_NAME, PI_VERSION);
		const cmdLine = wrapped.split("\n").pop()!;
		expect(cmdLine).toContain("git commit");
		expect(cmdLine).not.toMatch(/\brtk\s+git\b/);
		expect(cmdLine).toMatch(/^export RTK_DB_PATH=/);
	});

	// 变更原因：RTK 会把复合命令里的所有 git 调用都加上 rtk 前缀，
	// replaceAll 必须去掉所有 rtk git 前缀。
	it("strips all rtk prefixes in compound commands", () => {
		const rtkCmd = "cd /tmp && rtk git add . && rtk git commit -m \"test\"";
		const wrapped = wrapGitWithTrailers(rtkCmd, MODEL_NAME, PI_VERSION);
		const cmdLine = wrapped.split("\n").pop()!;
		expect(cmdLine).toContain("git add .");
		expect(cmdLine).toContain("git commit");
		expect(cmdLine).not.toMatch(/\brtk\s+git\b/);
	});

	// 变更原因：RTK 前缀清理只能作用于真实命令，不能改写用户提交参数里的普通文本。
	it("preserves rtk git text inside commit arguments", () => {
		const cmd = 'git commit -m "foo rtk git bar"';
		const wrapped = wrapGitWithTrailers(cmd, MODEL_NAME, PI_VERSION);
		const cmdLine = wrapped.split("\n").pop()!;
		expect(cmdLine).toBe(cmd);
	});
});
