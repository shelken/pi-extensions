import { describe, expect, it } from "vitest";
import { isGitCommitCommand, splitSegments, tokenize } from "../lib/git-commit.ts";

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
