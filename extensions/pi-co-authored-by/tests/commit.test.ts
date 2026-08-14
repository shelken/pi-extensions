import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

	it("does not expose core.hooksPath via git config during the bash session", () => {
		withGitRepo((repo) => {
			const output = repo.run(`
echo one > a.txt
git add a.txt
git commit -q -m 'no hooksPath subject'
printf 'HOOKS_PATH=[%s]\n' "$(git config --get core.hooksPath || true)"
git log -1 --format=%B
`);

			expect(output).toContain("HOOKS_PATH=[]");
			expect(output).toContain(CO_AUTHOR);
			expect(output).toContain(GENERATED_BY);
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

	it("keeps trailers when a concurrent shell exits while another commits via absolute git", () => {
		withGitRepo((repo) => {
			const gitBin = execFileSync("bash", ["-lc", "command -v git"], {
				encoding: "utf8",
			}).trim();
			const ready = join(repo.cwd, ".b-ready");
			const env = createIsolatedGitEnvironment();
			const shellAPath = join(repo.cwd, ".shell-a.sh");
			const shellBPath = join(repo.cwd, ".shell-b.sh");

			writeFileSync(
				shellAPath,
				wrapBashWithCommitHook(
					`
set -euo pipefail
git status >/dev/null
while [ ! -f '${ready}' ]; do sleep 0.05; done
`,
					repo.hooksDir,
					MODEL_NAME,
					PI_VERSION,
				),
				{ mode: 0o755 },
			);
			writeFileSync(
				shellBPath,
				wrapBashWithCommitHook(
					`
set -euo pipefail
git status >/dev/null
touch '${ready}'
sleep 0.4
echo b > b.txt
'${gitBin}' add b.txt
'${gitBin}' commit -q -m 'concurrent abs subject'
'${gitBin}' log -1 --format=%B
`,
					repo.hooksDir,
					MODEL_NAME,
					PI_VERSION,
				),
				{ mode: 0o755 },
			);

			const output = execFileSync(
				"bash",
				[
					"-lc",
					`
set -euo pipefail
bash '${shellAPath}' >/dev/null 2>&1 &
APID=$!
sleep 0.15
bash '${shellBPath}'
wait $APID || true
`,
				],
				{
					cwd: repo.cwd,
					env,
					encoding: "utf8",
					stdio: ["ignore", "pipe", "pipe"],
				},
			);

			expect(output).toContain("concurrent abs subject");
			expect(output).toContain(CO_AUTHOR);
			expect(output).toContain(GENERATED_BY);
			expect(existsSync(join(repo.cwd, ".git/hooks/prepare-commit-msg"))).toBe(false);
		});
	});

	it("cleans leftover install from a previous crashed shell", () => {
		withGitRepo((repo) => {
			const userHook = join(repo.cwd, ".git/hooks/prepare-commit-msg");
			const userBackup = join(repo.cwd, ".git/hooks/prepare-commit-msg.pi-user");
			writeFileSync(userBackup, "#!/bin/sh\ntrue\n", { mode: 0o755 });
			execFileSync("cp", [join(repo.hooksDir, "prepare-commit-msg"), userHook]);
			execFileSync("chmod", ["+x", userHook]);
			expect(readFileSync(userHook, "utf8")).toContain("PI_CO_AUTHORED_BY_HOOK_MARKER");
			expect(existsSync(userBackup)).toBe(true);

			repo.run(`
git status >/dev/null
`);

			expect(existsSync(userBackup)).toBe(false);
			expect(existsSync(userHook)).toBe(true);
			expect(readFileSync(userHook, "utf8")).not.toContain("PI_CO_AUTHORED_BY_HOOK_MARKER");
		});
	});
});
