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

	it("rejects commands without a commit", () => {
		expect(containsGitCommit("git status --short")).toBe(false);
		expect(containsGitCommit("")).toBe(false);
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
});
