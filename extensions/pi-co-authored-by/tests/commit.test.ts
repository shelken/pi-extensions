import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
	createCommitHookDirectory,
	removeCommitHookDirectory,
	wrapBashWithCommitHook,
} from "../src/commit.ts";

const MODEL_NAME = "Model O'Clock";
const OTHER_MODEL_NAME = "Other Model";
const PI_VERSION = "0.75.5";
const CO_AUTHOR = `Co-Authored-By: ${MODEL_NAME} <noreply@pi.dev>`;
const OTHER_CO_AUTHOR = `Co-Authored-By: ${OTHER_MODEL_NAME} <noreply@pi.dev>`;
const GENERATED_BY = `Generated-By: pi ${PI_VERSION}`;

type RunOptions = { generatorName?: string; coAuthorEmail?: string };

type GitRepo = {
	cwd: string;
	hooksDir: string;
	run: (script: string, modelName?: string, options?: RunOptions) => string;
	runFrom: (
		dir: string,
		script: string,
		modelName?: string,
		options?: RunOptions,
		env?: NodeJS.ProcessEnv,
	) => string;
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

function initGitRepo(dir: string): void {
	execFileSync(
		"bash",
		[
			"-c",
			`
set -euo pipefail
git init -q
git config user.name Tester
git config user.email tester@example.com
`,
		],
		{ cwd: dir, env: createIsolatedGitEnvironment(), stdio: ["ignore", "pipe", "pipe"] },
	);
}

function runWrapped(
	cwd: string,
	hooksDir: string,
	script: string,
	modelName: string,
	options?: RunOptions,
	env?: NodeJS.ProcessEnv,
): string {
	return execFileSync(
		"bash",
		[
			"-c",
			`set -euo pipefail\n${wrapBashWithCommitHook(script, hooksDir, modelName, PI_VERSION, options)}`,
		],
		{
			cwd,
			env: env ?? createIsolatedGitEnvironment(),
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
}

function createGitRepo(): GitRepo {
	const cwd = mkdtempSync(join(tmpdir(), "pi-co-authored-by-"));
	const hooksDir = createCommitHookDirectory();
	initGitRepo(cwd);

	return {
		cwd,
		hooksDir,
		run: (script, modelName = MODEL_NAME, options) =>
			runWrapped(cwd, hooksDir, script, modelName, options),
		runFrom: (dir, script, modelName = MODEL_NAME, options, env) =>
			runWrapped(dir, hooksDir, script, modelName, options, env),
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

// 一个与仓库无关的隔离目录（非仓库），用于验证 git -C / cd / 绝对路径等调用形态
function withScratch<T>(fn: (dir: string) => T): T {
	const dir = mkdtempSync(join(tmpdir(), "pi-co-authored-by-scratch-"));
	try {
		return fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
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
git log -1 --format=%B
`);

			expect(output).toContain("simple subject");
			expect(output).toContain(CO_AUTHOR);
			expect(output).toContain(GENERATED_BY);
			// bash 退出后 cleanup 应摘掉临时 hook，且不写仓库 core.hooksPath
			expect(
				execFileSync("bash", ["-lc", "git config --local --get core.hooksPath || true"], {
					cwd: repo.cwd,
					encoding: "utf8",
				}),
			).toBe("");
			expect(existsSync(join(repo.cwd, ".git/hooks/prepare-commit-msg"))).toBe(false);
		});
	});

	it("preserves literal special characters in quoted heredoc commit messages", () => {
		withGitRepo((repo) => {
			const message = [
				"fix: preserve quoted heredoc",
				"",
				"paired `touch backtick-probe` and unmatched `",
				"$(touch substitution-probe) $HOME",
				"single ' and double \" quotes",
				"multiline body",
			].join("\n");
			const output = repo.run(`
git commit --allow-empty -q -m "$(cat <<'EOF'
${message}
EOF
)"
git log -1 --format=%B
`);

			expect(output).toBe(`${message}\n\n${CO_AUTHOR}\n${GENERATED_BY}\n\n`);
			expect(existsSync(join(repo.cwd, "backtick-probe"))).toBe(false);
			expect(existsSync(join(repo.cwd, "substitution-probe"))).toBe(false);
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
	}, 15000);

	it("skips chaining a Co-Authored-By injector hook (dsh residue) to avoid duplicate trailers", () => {
		withGitRepo((repo) => {
			// 模拟 dsh-co-authored-by 残留的注入 hook
			writeFileSync(
				join(repo.cwd, ".git/hooks/prepare-commit-msg"),
				`#!/bin/sh
# DSH_CO_AUTHORED_BY_HOOK
set -eu
command git -c trailer.co-authored-by.ifExists=addIfDifferent \\
  interpret-trailers --in-place --trailer 'Co-Authored-By: dsh-model <noreply@deepseek.com>' "$1"
`,
				{ mode: 0o755 },
			);

			const output = repo.run(`
echo one > a.txt
git add a.txt
git commit -q -m 'dual injector subject'
git log -1 --format=%B
`);

			expect(output).toContain(CO_AUTHOR);
			expect(output).toContain(GENERATED_BY);
			expect(countOccurrences(output, "Co-Authored-By:")).toBe(1);
			expect(output).not.toContain("noreply@deepseek.com");
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

	it("supports dynamic generator name (e.g. omp) and custom co-author email", () => {
		withGitRepo((repo) => {
			const output = repo.run(
				`
echo test > custom.txt
git add custom.txt
git commit -q -m 'custom trailer test'
git log -1 --format=%B
`,
				"Gemini Flash",
				{
					generatorName: "omp",
					coAuthorEmail: "hakase@ooooo.space",
				},
			);

			expect(output).toContain("custom trailer test");
			expect(output).toContain("Co-Authored-By: Gemini Flash <hakase@ooooo.space>");
			expect(output).toContain(`Generated-By: omp ${PI_VERSION}`);
		});
	});

	// #96：提交所在仓库与调用形态不应影响 trailer 注入
	it("adds trailers to `git -C <repo> commit` run from outside any repository", () => {
		withGitRepo((repo) => {
			withScratch((outside) => {
				const output = repo.runFrom(
					outside,
					`
git -C '${repo.cwd}' commit --allow-empty -q -m 'git -C from outside'
git -C '${repo.cwd}' log -1 --format=%B
`,
				);

				expect(output).toContain("git -C from outside");
				expect(output).toContain(CO_AUTHOR);
				expect(output).toContain(GENERATED_BY);
			});
		});
	});

	it("adds trailers to `git -C <repo> commit` run from another repository", () => {
		withGitRepo((repo) => {
			withScratch((scratch) => {
				const other = join(scratch, "other");
				mkdirSync(other);
				initGitRepo(other);

				const output = repo.runFrom(
					other,
					`
git -C '${repo.cwd}' commit --allow-empty -q -m 'git -C from another repo'
git -C '${repo.cwd}' log -1 --format=%B
git -C '${other}' log --oneline || echo 'other repo still empty'
`,
				);

				expect(output).toContain("git -C from another repo");
				expect(output).toContain(CO_AUTHOR);
				expect(output).toContain(GENERATED_BY);
				expect(output).toContain("other repo still empty");
			});
		});
	});

	it("adds trailers when committing via `command git` after cd", () => {
		withGitRepo((repo) => {
			withScratch((outside) => {
				const output = repo.runFrom(
					outside,
					`
cd '${repo.cwd}'
command git commit --allow-empty -q -m 'command git after cd'
git log -1 --format=%B
`,
				);

				expect(output).toContain("command git after cd");
				expect(output).toContain(CO_AUTHOR);
				expect(output).toContain(GENERATED_BY);
			});
		});
	});

	it("adds trailers when committing via an absolute git path after cd", () => {
		const gitBin = execFileSync("bash", ["-lc", "command -v git"], { encoding: "utf8" }).trim();
		withGitRepo((repo) => {
			withScratch((outside) => {
				const output = repo.runFrom(
					outside,
					`
cd '${repo.cwd}'
'${gitBin}' commit --allow-empty -q -m 'absolute git after cd'
git log -1 --format=%B
`,
				);

				expect(output).toContain("absolute git after cd");
				expect(output).toContain(CO_AUTHOR);
				expect(output).toContain(GENERATED_BY);
			});
		});
	});

	it("adds trailers for `exec git commit` without leaving anything in the repository", () => {
		withGitRepo((repo) => {
			const hooksBefore = readdirSync(join(repo.cwd, ".git/hooks")).sort();
			withScratch((outside) => {
				repo.runFrom(
					outside,
					`cd '${repo.cwd}'\nexec git commit --allow-empty -q -m 'exec subject'`,
				);
			});

			const message = execFileSync("git", ["log", "-1", "--format=%B"], {
				cwd: repo.cwd,
				env: createIsolatedGitEnvironment(),
				encoding: "utf8",
			});
			expect(message).toContain("exec subject");
			expect(message).toContain(CO_AUTHOR);
			expect(message).toContain(GENERATED_BY);
			expect(readdirSync(join(repo.cwd, ".git/hooks")).sort()).toEqual(hooksBefore);
		});
	});

	it("adds trailers to a commit inside a brace group", () => {
		withGitRepo((repo) => {
			const output = repo.run(`
{
  git commit --allow-empty -q -m 'braced subject'
}
git log -1 --format=%B
`);

			expect(output).toContain("braced subject");
			expect(output).toContain(CO_AUTHOR);
			expect(output).toContain(GENERATED_BY);
		});
	});

	it("keeps running the user's pre-commit and commit-msg hooks", () => {
		withGitRepo((repo) => {
			const hookLog = join(repo.cwd, ".hook-log");
			writeFileSync(
				join(repo.cwd, ".git/hooks/pre-commit"),
				`#!/bin/sh\necho user-pre-commit >> '${hookLog}'\n`,
				{ mode: 0o755 },
			);
			writeFileSync(
				join(repo.cwd, ".git/hooks/commit-msg"),
				`#!/bin/sh\necho user-commit-msg >> '${hookLog}'\nprintf '\\nCommit-Msg-Hook: yes\\n' >> "$1"\n`,
				{ mode: 0o755 },
			);

			const output = repo.run(`
git commit --allow-empty -q -m 'user hooks subject'
cat '${hookLog}'
git log -1 --format=%B
`);

			expect(output).toContain("user-pre-commit");
			expect(output).toContain("user-commit-msg");
			expect(output).toContain("Commit-Msg-Hook: yes");
			expect(output).toContain(CO_AUTHOR);
		});
	});

	it("runs the user's pre-push hook with git's stdin", () => {
		withGitRepo((repo) => {
			withScratch((scratch) => {
				const remote = join(scratch, "remote.git");
				execFileSync("git", ["init", "-q", "--bare", remote], {
					env: createIsolatedGitEnvironment(),
				});
				const stdinLog = join(repo.cwd, ".prepush-stdin");
				writeFileSync(
					join(repo.cwd, ".git/hooks/pre-push"),
					`#!/bin/sh\ncat > '${stdinLog}'\n`,
					{ mode: 0o755 },
				);

				repo.run(`
git remote add origin '${remote}'
git commit --allow-empty -q -m 'push subject'
git push -q origin HEAD:refs/heads/main
cat '${stdinLog}'
`);

				expect(readFileSync(stdinLog, "utf8")).toContain("refs/heads/main");
			});
		});
	});

	it("lets a user hook read the repository's real core.hooksPath", () => {
		withGitRepo((repo) => {
			const userHooks = join(repo.cwd, "user-hooks");
			const hookLog = join(repo.cwd, ".hook-log");
			mkdirSync(userHooks);
			writeFileSync(
				join(userHooks, "prepare-commit-msg"),
				`#!/bin/sh\nprintf 'HOOKS_PATH=[%s]\\n' "$(git config --get core.hooksPath || true)" >> '${hookLog}'\n`,
				{ mode: 0o755 },
			);

			const output = repo.run(`
git config core.hooksPath '${userHooks}'
git commit --allow-empty -q -m 'real hooksPath subject'
cat '${hookLog}'
git log -1 --format=%B
`);

			expect(output).toContain(`HOOKS_PATH=[${userHooks}]`);
			expect(output).toContain(CO_AUTHOR);
		});
	});

	it("preserves a user's own GIT_CONFIG_* environment configuration", () => {
		withGitRepo((repo) => {
			const hookLog = join(repo.cwd, ".hook-log");
			writeFileSync(
				join(repo.cwd, ".git/hooks/commit-msg"),
				`#!/bin/sh\necho "user.name=$(git config --get user.name)" >> '${hookLog}'\n`,
				{ mode: 0o755 },
			);
			const env = createIsolatedGitEnvironment();
			env.GIT_CONFIG_COUNT = "1";
			env.GIT_CONFIG_KEY_0 = "user.name";
			env.GIT_CONFIG_VALUE_0 = "Env Config User";

			const output = repo.runFrom(
				repo.cwd,
				`
git commit --allow-empty -q -m 'env config subject'
cat '${hookLog}'
git log -1 --format='%B|author=%an'
`,
				MODEL_NAME,
				undefined,
				env,
			);

			expect(output).toContain("user.name=Env Config User");
			expect(output).toContain("author=Env Config User");
			expect(output).toContain(CO_AUTHOR);
		});
	});

	it("defers to an explicit -c core.hooksPath in the command", () => {
		withGitRepo((repo) => {
			const altHooks = join(repo.cwd, "alt-hooks");
			const hookLog = join(repo.cwd, ".hook-log");
			mkdirSync(altHooks);
			writeFileSync(
				join(altHooks, "prepare-commit-msg"),
				`#!/bin/sh\necho alt-user-hook >> '${hookLog}'\n`,
				{ mode: 0o755 },
			);

			const output = repo.run(`
git -c core.hooksPath='${altHooks}' commit --allow-empty -q -m 'alt hooksPath subject'
cat '${hookLog}'
git log -1 --format=%B
`);

			expect(output).toContain("alt-user-hook");
			expect(output).toContain("alt hooksPath subject");
		});
	});

	it("leaves the target repository's hooks and config untouched", () => {
		withGitRepo((repo) => {
			const hooksPath = join(repo.cwd, ".git/hooks");
			const configPath = join(repo.cwd, ".git/config");
			const hooksBefore = readdirSync(hooksPath).sort();
			const configBefore = readFileSync(configPath, "utf8");

			repo.run(`git commit --allow-empty -q -m 'untouched subject'`);

			expect(readdirSync(hooksPath).sort()).toEqual(hooksBefore);
			expect(readFileSync(configPath, "utf8")).toBe(configBefore);
		});
	});

	// 嵌套包装：agent 被包装的命令又启动了一个会提交的 omp/pi 会话
	it("finishes a double-wrapped commit without looping (same hook directory)", () => {
		withGitRepo((repo) => {
			const hookLog = join(repo.cwd, ".hook-log");
			writeFileSync(
				join(repo.cwd, ".git/hooks/prepare-commit-msg"),
				`#!/bin/sh\necho user-hook >> '${hookLog}'\n`,
				{ mode: 0o755 },
			);

			const inner = wrapBashWithCommitHook(
				`git commit --allow-empty -q -m 'nested subject'\ngit log -1 --format=%B`,
				repo.hooksDir,
				OTHER_MODEL_NAME,
				PI_VERSION,
			);
			const outer = wrapBashWithCommitHook(inner, repo.hooksDir, MODEL_NAME, PI_VERSION);
			const output = execFileSync("bash", ["-c", `set -euo pipefail\n${outer}`], {
				cwd: repo.cwd,
				env: createIsolatedGitEnvironment(),
				encoding: "utf8",
				timeout: 8000,
				stdio: ["ignore", "pipe", "pipe"],
			});

			expect(output).toContain("nested subject");
			// 内层包装的赋值覆盖外层，内层模型生效
			expect(output).toContain(OTHER_CO_AUTHOR);
			expect(output).not.toContain(CO_AUTHOR);
			// 用户 hook 只跑一次，不会被转发器反复 exec
			expect(countOccurrences(readFileSync(hookLog, "utf8"), "user-hook")).toBe(1);
		});
	}, 15000);

	it("finishes a double-wrapped commit without looping (different hook directories)", () => {
		withGitRepo((repo) => {
			const otherHooksDir = createCommitHookDirectory();
			try {
				const hookLog = join(repo.cwd, ".hook-log");
				writeFileSync(
					join(repo.cwd, ".git/hooks/prepare-commit-msg"),
					`#!/bin/sh\necho user-hook >> '${hookLog}'\n`,
					{ mode: 0o755 },
				);

				const inner = wrapBashWithCommitHook(
					`git commit --allow-empty -q -m 'nested subject'\ngit log -1 --format=%B`,
					repo.hooksDir,
					OTHER_MODEL_NAME,
					PI_VERSION,
				);
				const outer = wrapBashWithCommitHook(inner, otherHooksDir, MODEL_NAME, PI_VERSION);
				const output = execFileSync("bash", ["-c", `set -euo pipefail\n${outer}`], {
					cwd: repo.cwd,
					env: createIsolatedGitEnvironment(),
					encoding: "utf8",
					timeout: 8000,
					stdio: ["ignore", "pipe", "pipe"],
				});

				expect(output).toContain("nested subject");
				expect(output).toContain(OTHER_CO_AUTHOR);
				expect(countOccurrences(readFileSync(hookLog, "utf8"), "user-hook")).toBe(1);
			} finally {
				removeCommitHookDirectory(otherHooksDir);
			}
		});
	}, 15000);

	it("normalises a non-canonical GIT_CONFIG_COUNT", () => {
		withGitRepo((repo) => {
			const hookLog = join(repo.cwd, ".hook-log");
			writeFileSync(
				join(repo.cwd, ".git/hooks/commit-msg"),
				`#!/bin/sh\necho "user.name=$(git config --get user.name)" >> '${hookLog}'\n`,
				{ mode: 0o755 },
			);
			const env = createIsolatedGitEnvironment();
			env.GIT_CONFIG_COUNT = "01";
			env.GIT_CONFIG_KEY_0 = "user.name";
			env.GIT_CONFIG_VALUE_0 = "Env Config User";

			const output = repo.runFrom(
				repo.cwd,
				`
git commit --allow-empty -q -m 'prefixed count subject'
cat '${hookLog}'
git log -1 --format='%B|author=%an'
`,
				MODEL_NAME,
				undefined,
				env,
			);

			expect(output).toContain("prefixed count subject");
			expect(output).toContain("author=Env Config User");
			expect(output).toContain("user.name=Env Config User");
			expect(output).toContain(CO_AUTHOR);
		});
	});

	// 三个槽位：插件 A → 用户 core.hooksPath → 插件 B：用户 hook 必须被找到并生效
	it("keeps a user hooksPath that sits between two plugin slots", () => {
		withGitRepo((repo) => {
			const userHooks = join(repo.cwd, "user-hooks");
			const hookLog = join(repo.cwd, ".hook-log");
			const seenHooksPath = join(repo.cwd, ".hook-hookspath");
			mkdirSync(userHooks);
			writeFileSync(
				join(userHooks, "pre-commit"),
				`#!/bin/sh
echo rejecting-pre-commit >> '${hookLog}'
git config --get core.hooksPath > '${seenHooksPath}' 2>/dev/null || true
exit 29
`,
				{ mode: 0o755 },
			);

			const innerHooksDir = createCommitHookDirectory();
			try {
				const inner = wrapBashWithCommitHook(
					`git commit --allow-empty -q -m 'three slots subject'`,
					innerHooksDir,
					OTHER_MODEL_NAME,
					PI_VERSION,
				);
				const outer = wrapBashWithCommitHook(
					`GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_1=core.hooksPath GIT_CONFIG_VALUE_1='${userHooks}' ${inner}`,
					repo.hooksDir,
					MODEL_NAME,
					PI_VERSION,
				);

				expect(() =>
					execFileSync("bash", ["-c", `set -euo pipefail\n${outer}`], {
						cwd: repo.cwd,
						env: createIsolatedGitEnvironment(),
						encoding: "utf8",
						timeout: 8000,
						stdio: ["ignore", "pipe", "pipe"],
					}),
				).toThrow();

				expect(existsSync(hookLog) ? readFileSync(hookLog, "utf8") : "").toContain(
					"rejecting-pre-commit",
				);
				// 用户 hook 及其子进程必须看到用户自己的 hooksPath
				expect(existsSync(seenHooksPath) ? readFileSync(seenHooksPath, "utf8").trim() : "").toBe(
					userHooks,
				);
				expect(() =>
					execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
						cwd: repo.cwd,
						env: createIsolatedGitEnvironment(),
						stdio: "ignore",
					}),
				).toThrow();
			} finally {
				removeCommitHookDirectory(innerHooksDir);
			}
		});
	}, 15000);

	// 用户自己的 hooksPath 槽位在插件槽位之前：必须解析到用户目录，pre-commit 退出 29 必须中止提交
	it("runs a rejecting user pre-commit from a hooksPath set before the plugin slot", () => {
		withGitRepo((repo) => {
			const userHooks = join(repo.cwd, "user-hooks");
			const hookLog = join(repo.cwd, ".hook-log");
			mkdirSync(userHooks);
			writeFileSync(
				join(userHooks, "pre-commit"),
				`#!/bin/sh\necho rejecting-pre-commit >> '${hookLog}'\nexit 29\n`,
				{ mode: 0o755 },
			);
			const env = createIsolatedGitEnvironment();
			env.GIT_CONFIG_COUNT = "1";
			env.GIT_CONFIG_KEY_0 = "core.hooksPath";
			env.GIT_CONFIG_VALUE_0 = userHooks;

			const wrapped = wrapBashWithCommitHook(
				`git commit --allow-empty -q -m 'should be rejected'`,
				repo.hooksDir,
				MODEL_NAME,
				PI_VERSION,
			);
			expect(() =>
				execFileSync("bash", ["-c", `set -euo pipefail\n${wrapped}`], {
					cwd: repo.cwd,
					env,
					encoding: "utf8",
					timeout: 8000,
					stdio: ["ignore", "pipe", "pipe"],
				}),
			).toThrow();

			expect(existsSync(hookLog) ? readFileSync(hookLog, "utf8") : "").toContain(
				"rejecting-pre-commit",
			);
			expect(() =>
				execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
					cwd: repo.cwd,
					env: createIsolatedGitEnvironment(),
					stdio: "ignore",
				}),
			).toThrow();
		});
	}, 15000);

	it("accepts a leading plus in GIT_CONFIG_COUNT", () => {
		withGitRepo((repo) => {
			const env = createIsolatedGitEnvironment();
			env.GIT_CONFIG_COUNT = "+1";
			env.GIT_CONFIG_KEY_0 = "user.name";
			env.GIT_CONFIG_VALUE_0 = "Plus User";

			const output = repo.runFrom(
				repo.cwd,
				`
git commit --allow-empty -q -m 'plus count subject'
git log -1 --format='%B|author=%an'
`,
				MODEL_NAME,
				undefined,
				env,
			);

			expect(output).toContain("plus count subject");
			expect(output).toContain("author=Plus User");
			expect(output).toContain(CO_AUTHOR);
			expect(output).toContain(GENERATED_BY);
		});
	});

	// 非规范计数（前导空格、位数过多、非数字）：不注入任何配置，命令原样执行
	it("leaves the environment untouched for non-canonical GIT_CONFIG_COUNT values", () => {
		withGitRepo((repo) => {
			for (const value of [" 1", "1234567890", "not-a-number"]) {
				const env = createIsolatedGitEnvironment();
				env.GIT_CONFIG_COUNT = value;

				const output = repo.runFrom(
					repo.cwd,
					`printf 'COUNT=[%s]\\n' "$GIT_CONFIG_COUNT"`,
					MODEL_NAME,
					undefined,
					env,
				);

				expect(output).toBe(`COUNT=[${value}]\n`);
			}
		});
	});
});
