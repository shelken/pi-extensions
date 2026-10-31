import { describe, expect, it } from "vitest";
import { isGitCommitCommand, splitSegments, tokenize } from "../src/git-commit.ts";

describe("isGitCommitCommand", () => {
	it("detects plain git commit", () => {
		expect(isGitCommitCommand("git commit -m 'fix'")).toBe(true);
		expect(isGitCommitCommand("git commit --amend")).toBe(true);
		expect(isGitCommitCommand("git commit --no-verify -m x")).toBe(true);
	});

	it("detects absolute git path", () => {
		expect(isGitCommitCommand("/usr/bin/git commit -m x")).toBe(true);
		expect(isGitCommitCommand("/usr/local/bin/git commit")).toBe(true);
	});

	it("detects transparent wrappers", () => {
		expect(isGitCommitCommand("command git commit")).toBe(true);
		expect(isGitCommitCommand("env FOO=bar git commit")).toBe(true);
		expect(isGitCommitCommand("sudo git commit -m x")).toBe(true);
		expect(isGitCommitCommand("doas git commit")).toBe(true);
		expect(isGitCommitCommand("timeout 30 git commit")).toBe(true);
		expect(isGitCommitCommand("rtk git commit -m x")).toBe(true);
	});

	it("detects git global options", () => {
		expect(isGitCommitCommand("git -C repo commit -m x")).toBe(true);
		expect(isGitCommitCommand("git --git-dir=.git commit")).toBe(true);
		expect(isGitCommitCommand("git -c user.name=x commit")).toBe(true);
		expect(isGitCommitCommand("git --work-tree=out commit")).toBe(true);
	});

	it("detects commands joined by control operators", () => {
		expect(isGitCommitCommand("cd repo && git commit -m x")).toBe(true);
		expect(isGitCommitCommand("git add . && git commit -m x")).toBe(true);
		expect(isGitCommitCommand("git status | git commit")).toBe(true);
		expect(isGitCommitCommand("git commit || echo failed")).toBe(true);
		expect(isGitCommitCommand("if git commit; then echo ok; fi")).toBe(true);
		expect(isGitCommitCommand("( cd repo && git commit )")).toBe(true);
	});

	it("detects env prefix before git", () => {
		expect(isGitCommitCommand("FOO=bar git commit")).toBe(true);
		expect(isGitCommitCommand("RTK_DB_PATH=/tmp/x rtk git commit")).toBe(true);
	});

	it("detects commits after shell comments", () => {
		expect(isGitCommitCommand("# don't\ngit commit -m x")).toBe(true);
		expect(isGitCommitCommand("git status # note\n git commit -m x")).toBe(true);
		expect(isGitCommitCommand("echo hi && # note\n git commit -m x")).toBe(true);
		expect(isGitCommitCommand("{ # note\ngit commit -m x; }")).toBe(true);
	});

	it("ignores text inside comments", () => {
		expect(isGitCommitCommand("# git commit -m x")).toBe(false);
		expect(isGitCommitCommand("echo done # git commit -m x")).toBe(false);
		expect(isGitCommitCommand("git status # 上文; git commit -m x")).toBe(false);
		expect(isGitCommitCommand("(echo hi)# git commit -m x")).toBe(false);
		expect(isGitCommitCommand("(echo hi)# note\ngit commit -m x")).toBe(true);
	});

	it("keeps # that is not a comment start as literal", () => {
		expect(isGitCommitCommand("n=${#x} && git commit -m x")).toBe(true);
		expect(isGitCommitCommand("git commit -m 'fix #42'")).toBe(true);
		expect(isGitCommitCommand("echo '# git commit -m x'")).toBe(false);
		expect(isGitCommitCommand("echo ${#x}#y")).toBe(false);
	});

	it("keeps # literal after escaped chars and inside ${...}", () => {
		// 转义空格使 #bar 仍属同一个词，bash 不当注释
		expect(
			isGitCommitCommand("printf '%s\\n' foo\\ #bar; git commit --allow-empty -m escaped"),
		).toBe(true);
		expect(isGitCommitCommand("echo a\\ #b\ngit commit -m x")).toBe(true);
		// ${...} 内的 # 是参数展开运算符，括号也不是词边界
		expect(
			isGitCommitCommand('v=")#hello"; echo ${v#)#}; git commit --allow-empty -m actual'),
		).toBe(true);
		expect(isGitCommitCommand("echo ${v#)#}")).toBe(false);
		expect(isGitCommitCommand("echo ${a:-${b#c}} # note\ngit commit -m x")).toBe(true);
	});

	it("treats plain braces inside ${...} as literals", () => {
		expect(
			isGitCommitCommand(
				'v="{hello"; echo ${v#{}}; git commit --allow-empty -m literal-brace',
			),
		).toBe(true);
		expect(
			isGitCommitCommand("echo ${missing:-{}; git commit --allow-empty -m default-brace"),
		).toBe(true);
		expect(isGitCommitCommand("echo ${missing:-{}}")).toBe(false);
		expect(isGitCommitCommand("echo ${v%\\}}# literal\ngit commit -m x")).toBe(true);
	});

	it("resets word state at control operators", () => {
		// bash 只打印 x;，其余全是注释，不会提交
		expect(
			isGitCommitCommand("echo x\\;;# comment; git commit --allow-empty -m commented"),
		).toBe(false);
		expect(isGitCommitCommand("echo x\\;; # c\ngit commit --allow-empty -m real")).toBe(true);
	});

	it("does not let an unterminated ${...} swallow later lines", () => {
		expect(isGitCommitCommand("cat <<'EOF'\n${x\nEOF\ngit commit -m x")).toBe(true);
	});

	it("detects brace group bodies", () => {
		expect(isGitCommitCommand("{ git commit -m x; }")).toBe(true);
		expect(isGitCommitCommand("{ git commit -m x\n}")).toBe(true);
		expect(isGitCommitCommand("git add . && { git commit -m x; }")).toBe(true);
		expect(isGitCommitCommand("{ echo hi; }")).toBe(false);
		expect(isGitCommitCommand("{git commit -m x;}")).toBe(false);
	});

	it("detects subshells glued to parens", () => {
		expect(isGitCommitCommand("(git commit -m x)")).toBe(true);
		expect(isGitCommitCommand("(cd repo && git commit -m x)")).toBe(true);
		expect(isGitCommitCommand("$(git commit -m x)")).toBe(true);
		expect(isGitCommitCommand("x=$(git commit -m x)")).toBe(true);
		expect(isGitCommitCommand("(echo hi)")).toBe(false);
		expect(isGitCommitCommand("echo \"$(git commit)\"")).toBe(false);
	});

	it("detects negation and loop keywords", () => {
		expect(isGitCommitCommand("! git commit -m x")).toBe(true);
		expect(isGitCommitCommand("! echo hi")).toBe(false);
		expect(isGitCommitCommand("while git commit -m x; do :; done")).toBe(true);
		expect(isGitCommitCommand("until git commit -m x; do :; done")).toBe(true);
	});

	it("keeps transparent wrappers working inside groups", () => {
		expect(isGitCommitCommand("exec git commit -m x")).toBe(true);
		expect(isGitCommitCommand("{ exec git commit -m x; }")).toBe(true);
		expect(isGitCommitCommand("! exec env FOO=1 git commit")).toBe(true);
	});

	it("keeps detecting commit lines inside heredoc bodies", () => {
		expect(isGitCommitCommand("git commit -F - <<'EOF'\nsubject\nEOF")).toBe(true);
		expect(isGitCommitCommand("cat <<'EOF' > msg\ngit commit -m x\nEOF")).toBe(true);
	});

	it("rejects non-commit git commands", () => {
		expect(isGitCommitCommand("git status")).toBe(false);
		expect(isGitCommitCommand("git add -A")).toBe(false);
		expect(isGitCommitCommand("git diff --cached")).toBe(false);
		expect(isGitCommitCommand("git log --oneline")).toBe(false);
		expect(isGitCommitCommand("git ci")).toBe(false);
		expect(isGitCommitCommand("git commit-tree -m x")).toBe(false);
		expect(isGitCommitCommand("git merge --no-commit")).toBe(false);
	});

	it("rejects non-commit commands", () => {
		expect(isGitCommitCommand("printf 'hello'")).toBe(false);
		expect(isGitCommitCommand("ls -la")).toBe(false);
		expect(isGitCommitCommand("cd /tmp")).toBe(false);
	});

	it("rejects indirect execution", () => {
		expect(isGitCommitCommand("bash -c 'git commit -m x'")).toBe(false);
		expect(isGitCommitCommand("eval \"$CMD\"")).toBe(false);
		expect(isGitCommitCommand("./release.sh")).toBe(false);
		expect(isGitCommitCommand("make release")).toBe(false);
		expect(isGitCommitCommand("npm run release")).toBe(false);
		expect(isGitCommitCommand("echo 'git commit -m x'")).toBe(false);
		expect(isGitCommitCommand("xargs git commit")).toBe(false);
		expect(isGitCommitCommand("find . -exec git commit {} \\;")).toBe(false);
	});

	it("rejects alias and variable forms", () => {
		expect(isGitCommitCommand("g commit")).toBe(false);
		expect(isGitCommitCommand("$cmd commit")).toBe(false);
		expect(isGitCommitCommand("alias g=git")).toBe(false);
		expect(isGitCommitCommand("git() { command git \"$@\"; }")).toBe(false);
	});
});

describe("splitSegments", () => {
	it("splits on control operators but not inside quotes", () => {
		expect(splitSegments("a && b; c | d")).toEqual(["a", "b", "c", "d"]);
		expect(splitSegments("echo 'a;b' && git commit")).toEqual(["echo 'a;b'", "git commit"]);
	});
});

describe("tokenize", () => {
	it("keeps quoted groups as one token", () => {
		expect(tokenize("git commit -m 'hello world'")).toEqual([
			"git",
			"commit",
			"-m",
			"hello world",
		]);
	});
});
