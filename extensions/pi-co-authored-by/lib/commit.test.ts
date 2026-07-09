import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
	createCommitHookDirectory,
	removeCommitHookDirectory,
	wrapBashWithCommitHook,
} from "./commit.ts";

const MODEL_NAME = "Model O'Clock";
const OTHER_MODEL_NAME = "Other Model";
const PI_VERSION = "0.75.5";
const CO_AUTHOR = `Co-Authored-By: ${MODEL_NAME} <noreply@pi.dev>`;
const OTHER_CO_AUTHOR = `Co-Authored-By: ${OTHER_MODEL_NAME} <noreply@pi.dev>`;
const GENERATED_BY = `Generated-By: pi ${PI_VERSION}`;

type GitRepo = {
	cwd: string;
	hooksDir: string;
	run: (script: string, modelName?: string) => string;
	cleanup: () => void;
};

function createIsolatedGitEnvironment(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	for (const key of Object.keys(env)) {
		if (
			key.startsWith("PI_CO_AUTHORED_BY_") ||
			/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/.test(key)
		) {
			delete env[key];
		}
	}
	return env;
}

function createGitRepo(): GitRepo {
	const cwd = mkdtempSync(join(tmpdir(), "pi-co-authored-by-"));
	const hooksDir = createCommitHookDirectory();
	execFileSync(
		"bash",
		[
			"-lc",
			`
set -euo pipefail
git init -q
git config user.name Tester
git config user.email tester@example.com
`,
		],
		{ cwd, env: createIsolatedGitEnvironment(), stdio: ["ignore", "pipe", "pipe"] },
	);

	return {
		cwd,
		hooksDir,
		run(script: string, modelName = MODEL_NAME): string {
			return execFileSync(
				"bash",
				["-lc", `set -euo pipefail\n${wrapBashWithCommitHook(script, hooksDir, modelName, PI_VERSION)}`],
				{
					cwd,
					env: createIsolatedGitEnvironment(),
					encoding: "utf8",
					stdio: ["ignore", "pipe", "pipe"],
				},
			);
		},
		cleanup(): void {
			removeCommitHookDirectory(hooksDir);
			rmSync(cwd, { recursive: true, force: true });
		},
	};
}

function withGitRepo<T>(fn: (repo: GitRepo) => T): T {
	const repo = createGitRepo();
	try {
		return fn(repo);
	} finally {
		repo.cleanup();
	}
}

function countOccurrences(text: string, needle: string): number {
	return text.split(needle).length - 1;
}

describe("hook-based commit trailers", () => {
	it("appends trailers to a simple commit without persisting repository hook config", () => {
		withGitRepo((repo) => {
			const output = repo.run(`
echo one > a.txt
git add a.txt
git commit -q -m 'simple subject'
git config --local --get core.hooksPath || true
test ! -f .git/hooks/prepare-commit-msg
git log -1 --format=%B
`);

			expect(output).toContain("simple subject");
			expect(output).toContain(CO_AUTHOR);
			expect(output).toContain(GENERATED_BY);
			expect(
				execFileSync("bash", ["-lc", "git config --local --get core.hooksPath || true"], {
					cwd: repo.cwd,
					encoding: "utf8",
				}),
			).toBe("");
			expect(existsSync(join(repo.cwd, ".git/hooks/prepare-commit-msg"))).toBe(false);
		});
	});

	it("supports common git invocation and message shapes", () => {
		withGitRepo((repo) => {
			const output = repo.run(`
echo one > a.txt
git add a.txt
git commit -q -m 'plain subject'

echo two > b.txt
git add b.txt
"$(command -v git)" commit -q -m 'absolute subject'

echo three > c.txt
command git add c.txt
command git commit -q -m 'command subject'

echo four > d.txt
sh -c 'git add d.txt && git commit -q -m "nested subject"'

echo five > e.txt
git add e.txt
git commit -q -m "$(cat <<'EOF'
heredoc subject

heredoc body
EOF
)"

echo six > f.txt
cat > msg.txt <<'EOF'
file subject

file body
EOF
git add f.txt
git commit -q -F msg.txt

echo amend >> f.txt
git add f.txt
git commit -q --amend --no-edit

git log --format=%B --max-count=6
`);

			expect(output).toContain("plain subject");
			expect(output).toContain("absolute subject");
			expect(output).toContain("command subject");
			expect(output).toContain("nested subject");
			expect(output).toContain("heredoc body");
			expect(output).toContain("file body");
			expect(countOccurrences(output, CO_AUTHOR)).toBe(6);
			expect(countOccurrences(output, GENERATED_BY)).toBe(6);
		});
	});

	it("keeps non-commit git commands harmless", () => {
		withGitRepo((repo) => {
			const output = repo.run(`
git --version
echo one > a.txt
git add a.txt
git status --short
git log --oneline || true
`);

			expect(output).toContain("git version");
			expect(output).toContain("A  a.txt");
			expect(output).not.toContain(CO_AUTHOR);
		});
	});

	// 用户 hook 在仓库根目录运行；日志放仓库内，避免并发临时仓库共享父目录。
	it("runs the default user prepare-commit-msg hook after appending trailers", () => {
		withGitRepo((repo) => {
			const hookLog = join(repo.cwd, ".hook-log");
			writeFileSync(
				join(repo.cwd, ".git/hooks/prepare-commit-msg"),
				`#!/bin/sh
echo default-user-hook >> '${hookLog}'
printf '\nUser-Hook: default\n' >> "$1"
`,
				{ mode: 0o755 },
			);

			const output = repo.run(`
echo one > a.txt
git add a.txt
git commit -q -m 'default hook subject'
cat '${hookLog}'
git log -1 --format=%B
`);

			expect(output).toContain("default-user-hook");
			expect(output).toContain(CO_AUTHOR);
			expect(output).toContain("User-Hook: default");
		});
	});

	it("runs user hooks from absolute and relative core.hooksPath", () => {
		withGitRepo((repo) => {
			const absoluteHooks = join(repo.cwd, "absolute-hooks");
			const hookLog = join(repo.cwd, ".hook-log");
			execFileSync("mkdir", ["-p", absoluteHooks]);
			writeFileSync(
				join(absoluteHooks, "prepare-commit-msg"),
				`#!/bin/sh
echo absolute-user-hook >> '${hookLog}'
printf '\nUser-Hook: absolute\n' >> "$1"
`,
				{ mode: 0o755 },
			);

			const absoluteOutput = repo.run(`
git config core.hooksPath '${absoluteHooks}'
echo one > a.txt
git add a.txt
git commit -q -m 'absolute hook subject'
cat '${hookLog}'
git log -1 --format=%B
`);

			expect(absoluteOutput).toContain("absolute-user-hook");
			expect(absoluteOutput).toContain("User-Hook: absolute");
			expect(absoluteOutput).toContain(CO_AUTHOR);

			const relativeOutput = repo.run(`
rm '${hookLog}'
mkdir -p relative-hooks
cat > relative-hooks/prepare-commit-msg <<'EOF'
#!/bin/sh
echo relative-user-hook >> '${hookLog}'
printf '\nUser-Hook: relative\n' >> "$1"
EOF
chmod +x relative-hooks/prepare-commit-msg
git config core.hooksPath relative-hooks
echo two > b.txt
git add b.txt
git commit -q -m 'relative hook subject'
cat '${hookLog}'
git log -1 --format=%B
`);

			expect(relativeOutput).toContain("relative-user-hook");
			expect(relativeOutput).toContain("User-Hook: relative");
			expect(relativeOutput).toContain(CO_AUTHOR);
		});
	});

	it("propagates user hook failures", () => {
		withGitRepo((repo) => {
			const hookLog = join(repo.cwd, ".hook-log");
			writeFileSync(
				join(repo.cwd, ".git/hooks/prepare-commit-msg"),
				`#!/bin/sh
echo failing-user-hook >> '${hookLog}'
exit 42
`,
				{ mode: 0o755 },
			);

			expect(() =>
				repo.run(`
echo one > a.txt
git add a.txt
git commit -q -m 'blocked subject'
`),
			).toThrow();
			const log = execFileSync("cat", [hookLog], { cwd: repo.cwd, encoding: "utf8" });
			expect(log).toContain("failing-user-hook");
		});
	});

	it("uses the model from each bash tool call instead of hard-coding it in the hook", () => {
		withGitRepo((repo) => {
			repo.run(`
echo one > a.txt
git add a.txt
git commit -q -m 'first model subject'
`, MODEL_NAME);
			const output = repo.run(`
echo two > b.txt
git add b.txt
git commit -q -m 'second model subject'
git log --format=%B --max-count=2
`, OTHER_MODEL_NAME);

			expect(output).toContain(CO_AUTHOR);
			expect(output).toContain(OTHER_CO_AUTHOR);
			expect(countOccurrences(output, GENERATED_BY)).toBe(2);
			expect(readFileSync(join(repo.hooksDir, "prepare-commit-msg"), "utf8")).not.toContain(MODEL_NAME);
		});
	});
});
