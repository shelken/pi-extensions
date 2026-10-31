import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CO_AUTHOR_NAME = "Co-Authored-By";
export const GENERATED_BY_NAME = "Generated-By";

/**
 * githooks(5) 的全部 hook 名。
 * 不含 push-to-checkout 与 proc-receive：这两个 hook 一旦存在就会改变接收端行为。
 */
const GIT_HOOK_NAMES = [
	"applypatch-msg",
	"pre-applypatch",
	"post-applypatch",
	"pre-commit",
	"pre-merge-commit",
	"prepare-commit-msg",
	"commit-msg",
	"post-commit",
	"pre-rebase",
	"post-checkout",
	"post-merge",
	"pre-push",
	"pre-receive",
	"update",
	"post-receive",
	"post-update",
	"reference-transaction",
	"pre-auto-gc",
	"post-rewrite",
	"sendemail-validate",
	"fsmonitor-watchman",
	"p4-changelist",
	"p4-prepare-changelist",
	"p4-post-changelist",
	"p4-pre-submit",
	"post-index-change",
];

/** Create a session-scoped Git hooks directory for commit trailer injection. */
export function createCommitHookDirectory(): string {
	const hooksDir = mkdtempSync(join(tmpdir(), "pi-co-authored-by-hooks-"));
	writeFileSync(join(hooksDir, "run"), buildRunnerScript(), { mode: 0o755 });
	const dispatcher = buildDispatcherScript();
	// 每个 hook 名都放一份同名转发器：git 读到的任何 hook 都会转发回用户原 hook，
	// 仓库原有的 pre-commit/commit-msg/pre-push 等不会被 hooksPath 接管后跳过。
	for (const name of GIT_HOOK_NAMES) {
		writeFileSync(join(hooksDir, name), dispatcher, { mode: 0o755 });
	}
	return hooksDir;
}

/** Remove the session-scoped Git hooks directory. */
export function removeCommitHookDirectory(hooksDir: string | undefined): void {
	if (!hooksDir) return;
	rmSync(hooksDir, { recursive: true, force: true });
}

/**
 * 用外部 runner 包裹 git commit：其他改写器只能看到不可拆的 wrapper 调用，
 * 不会二次解析内部 shell；元数据经环境变量传入，命令作为单个引号参数。
 */
export function wrapBashWithCommitHook(
	cmd: string,
	hooksDir: string,
	modelName: string,
	piVersion: string,
	options?: {
		generatorName?: string;
		coAuthorEmail?: string;
	},
): string {
	const generatorName = options?.generatorName || "pi";
	const email = options?.coAuthorEmail || "noreply@pi.dev";
	const coAuthor = `${CO_AUTHOR_NAME}: ${modelName} <${email}>`;
	const generatedBy = `${GENERATED_BY_NAME}: ${generatorName} ${piVersion}`;
	const runPath = join(hooksDir, "run");

	return [
		`PI_CO_AUTHORED_BY_CO_AUTHOR=${shellQuote(coAuthor)}`,
		`PI_CO_AUTHORED_BY_GENERATED_BY=${shellQuote(generatedBy)}`,
		shellQuote(runPath),
		shellQuote(cmd),
	].join(" ");
}

// 把 core.hooksPath 指到本目录，让这个进程树里的所有 git 调用都用同一份 hook 配置；
// 自身不安装、不修改任何仓库。$1 是真正要执行的命令。
function buildRunnerScript(): string {
	return `#!/usr/bin/env bash
# PI_CO_AUTHORED_BY_RUNNER
# GIT_CONFIG_COUNT 只接受可选的 + 加 1-9 位数字；其余（含前导空格、位数过多、非数字）一律不改任何配置
__pi_co_authored_by_count="\${GIT_CONFIG_COUNT:-}"
case "$__pi_co_authored_by_count" in
  '') __pi_co_authored_by_count=0 ;;
  +*) __pi_co_authored_by_count="\${__pi_co_authored_by_count#+}" ;;
esac
__pi_co_authored_by_n=""
case "$__pi_co_authored_by_count" in
  ''|*[!0-9]*) ;;
  *) [ "\${#__pi_co_authored_by_count}" -le 9 ] && __pi_co_authored_by_n=$((10#$__pi_co_authored_by_count)) ;;
esac
# 非规范计数：不注入任何配置，直接执行命令，让 git 自己处理（此时不署名）
if [ -z "$__pi_co_authored_by_n" ]; then
  eval "$1"
  exit $?
fi

export "GIT_CONFIG_KEY_$__pi_co_authored_by_n=core.hooksPath"
__pi_co_authored_by_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export "GIT_CONFIG_VALUE_$__pi_co_authored_by_n=$__pi_co_authored_by_dir"
export GIT_CONFIG_COUNT=$((__pi_co_authored_by_n + 1))

eval "$1"
`;
}

// 每个 hook 名下的转发器：先注入 trailer，再把用户原 hook 找回来执行同名 hook。
function buildDispatcherScript(): string {
	return `#!/bin/sh
# PI_CO_AUTHORED_BY_DISPATCHER
name="\${0##*/}"

# 只有 prepare-commit-msg 负责写 trailer
if [ "$name" = "prepare-commit-msg" ] &&
  [ -n "\${PI_CO_AUTHORED_BY_CO_AUTHOR:-}" ] &&
  [ -n "\${PI_CO_AUTHORED_BY_GENERATED_BY:-}" ]; then
  command git \\
    -c trailer.co-authored-by.ifExists=addIfDifferent \\
    -c trailer.generated-by.ifExists=replace \\
    interpret-trailers \\
    --in-place \\
    --trailer "$PI_CO_AUTHORED_BY_CO_AUTHOR" \\
    --trailer "$PI_CO_AUTHORED_BY_GENERATED_BY" \\
    "$1"
fi

# 把指向插件临时目录的 core.hooksPath 槽位改成无害的 key：保持顺序与计数、其它条目不动，
# 于是下面解析到的是用户真实的 hooksPath，用户 hook 及其子进程也拿到这份中性化配置
__pi_count="\${GIT_CONFIG_COUNT:-0}"
case "$__pi_count" in
  ''|*[!0-9]*) __pi_count=0 ;;
esac
__pi_i=0
while [ "$__pi_i" -lt "$__pi_count" ]; do
  eval "__pi_key=\\\${GIT_CONFIG_KEY_$__pi_i:-}"
  eval "__pi_value=\\\${GIT_CONFIG_VALUE_$__pi_i:-}"
  if [ "$__pi_key" = "core.hooksPath" ] &&
    grep -q 'PI_CO_AUTHORED_BY_RUNNER' "$__pi_value/run" 2>/dev/null; then
    eval "export GIT_CONFIG_KEY_$__pi_i=pi-co-authored-by.neutralized"
  fi
  __pi_i=$((__pi_i + 1))
done

# hook 的 cwd 就是 git 运行 hook 的 cwd，默认目录与绝对/相对 hooksPath 都能命中
orig="$(command git rev-parse --git-path hooks 2>/dev/null)/$name"

# 解析出的“用户 hook”若本身就是插件转发器（不应发生），不要再 exec，避免自我递归
if [ -f "$orig" ] && grep -q 'PI_CO_AUTHORED_BY_DISPATCHER' "$orig" 2>/dev/null; then
  cat >/dev/null
  exit 0
fi

# 跳过会注入 Co-Authored-By 的既有 prepare-commit-msg(如 dsh 等其它注入器的残留 hook)，
# 避免同一提交被多个注入器写入重复 trailer
if [ "$name" = "prepare-commit-msg" ] && [ -x "$orig" ] && grep -q 'Co-Authored-By' "$orig" 2>/dev/null; then
  cat >/dev/null
  exit 0
fi

# exec 用户 hook：退出码透传，用户 hook 失败仍能中止提交
if [ -x "$orig" ]; then
  exec "$orig" "$@"
fi

# 没有用户 hook：吃掉 stdin，避免 stdin 型 hook(pre-push/reference-transaction 等)EPIPE
cat >/dev/null
exit 0
`;
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}
