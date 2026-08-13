import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CO_AUTHOR_NAME = "Co-Authored-By";
export const GENERATED_BY_NAME = "Generated-By";

/** Create a session-scoped Git hooks directory for commit trailer injection. */
export function createCommitHookDirectory(): string {
	const hooksDir = mkdtempSync(join(tmpdir(), "pi-co-authored-by-hooks-"));
	writeFileSync(join(hooksDir, "prepare-commit-msg"), buildPrepareCommitMsgHook(), {
		mode: 0o755,
	});
	writeFileSync(join(hooksDir, "run"), buildRunnerScript(), { mode: 0o755 });
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
): string {
	const coAuthor = `${CO_AUTHOR_NAME}: ${modelName} <noreply@pi.dev>`;
	const generatedBy = `${GENERATED_BY_NAME}: pi ${piVersion}`;
	const runPath = join(hooksDir, "run");

	return [
		`PI_CO_AUTHORED_BY_CO_AUTHOR=${shellQuote(coAuthor)}`,
		`PI_CO_AUTHORED_BY_GENERATED_BY=${shellQuote(generatedBy)}`,
		shellQuote(runPath),
		shellQuote(cmd),
	].join(" ");
}

function buildRunnerScript(): string {
	return `#!/bin/bash
# PI_CO_AUTHORED_BY_RUNNER
export PI_CO_AUTHORED_BY_HOOK_SRC="$(dirname "$0")/prepare-commit-msg"

__pi_co_authored_by_installed_hooks=""

__pi_co_authored_by_resolve_hooks_dir() {
  local configured hooks_dir toplevel
  configured="$(command git config --get core.hooksPath 2>/dev/null || true)"
  if [ -n "$configured" ]; then
    case "$configured" in
      /*) hooks_dir="$configured" ;;
      *)
        toplevel="$(command git rev-parse --show-toplevel 2>/dev/null)" || return 1
        hooks_dir="$toplevel/$configured"
        ;;
    esac
  else
    hooks_dir="$(command git rev-parse --git-path hooks 2>/dev/null)" || return 1
  fi
  # 绝对路径，避免 cwd 变化后 cleanup 找不到
  case "$hooks_dir" in
    /*) ;;
    *) hooks_dir="$(CDPATH= cd -- "$hooks_dir" 2>/dev/null && pwd)" || return 1 ;;
  esac
  printf '%s' "$hooks_dir"
}

# 清掉已死进程的 ref，避免 SIGKILL 后永远占坑
__pi_co_authored_by_prune_refs() {
  local refs_dir="$1" f pid
  [ -d "$refs_dir" ] || return 0
  for f in "$refs_dir"/*; do
    [ -e "$f" ] || continue
    pid="\${f##*/}"
    case "$pid" in
      ''|*[!0-9]*) rm -f "$f" ;;
      *) kill -0 "$pid" 2>/dev/null || rm -f "$f" ;;
    esac
  done
}

# 登记本 shell 对 hooks_dir 的引用（见 marker 也要登记，否则 sticky dirty）
__pi_co_authored_by_register() {
  local hooks_dir="$1" refs_dir
  refs_dir="$hooks_dir/.pi-co-authored-by-refs"
  mkdir -p "$refs_dir" 2>/dev/null || return 0
  __pi_co_authored_by_prune_refs "$refs_dir"
  : > "$refs_dir/$$" 2>/dev/null || return 0
  case "
$__pi_co_authored_by_installed_hooks
" in
    *"
$hooks_dir
"*) ;;
    *)
      __pi_co_authored_by_installed_hooks="$__pi_co_authored_by_installed_hooks
$hooks_dir"
      ;;
  esac
}

__pi_co_authored_by_ensure_hook() {
  local hooks_dir hook
  hooks_dir="$(__pi_co_authored_by_resolve_hooks_dir)" || return 0
  hook="$hooks_dir/prepare-commit-msg"
  mkdir -p "$hooks_dir" 2>/dev/null || return 0

  if [ -f "$hook" ] && grep -q 'PI_CO_AUTHORED_BY_HOOK_MARKER' "$hook" 2>/dev/null; then
    __pi_co_authored_by_register "$hooks_dir"
    return 0
  fi

  if [ -e "$hook" ] && [ ! -e "$hooks_dir/prepare-commit-msg.pi-user" ]; then
    mv "$hook" "$hooks_dir/prepare-commit-msg.pi-user"
  fi

  cp "$PI_CO_AUTHORED_BY_HOOK_SRC" "$hook"
  chmod +x "$hook"
  __pi_co_authored_by_register "$hooks_dir"
}

__pi_co_authored_by_cleanup() {
  local hooks_dir hook refs_dir
  printf '%s\n' "$__pi_co_authored_by_installed_hooks" | while IFS= read -r hooks_dir; do
    [ -n "$hooks_dir" ] || continue
    refs_dir="$hooks_dir/.pi-co-authored-by-refs"
    rm -f "$refs_dir/$$" 2>/dev/null || true
    __pi_co_authored_by_prune_refs "$refs_dir"
    # 仍有活进程占用：只退自己的 ref，不卸 hook
    if [ -n "$(ls -A "$refs_dir" 2>/dev/null)" ]; then
      continue
    fi
    rmdir "$refs_dir" 2>/dev/null || true
    hook="$hooks_dir/prepare-commit-msg"
    if [ -f "$hook" ] && grep -q 'PI_CO_AUTHORED_BY_HOOK_MARKER' "$hook" 2>/dev/null; then
      rm -f "$hook"
      if [ -e "$hooks_dir/prepare-commit-msg.pi-user" ]; then
        mv "$hooks_dir/prepare-commit-msg.pi-user" "$hook"
      fi
    fi
  done
}

trap '__pi_co_authored_by_cleanup' EXIT
__pi_co_authored_by_ensure_hook

git() {
  __pi_co_authored_by_ensure_hook
  command git "$@"
}

eval "$1"
`;
}

function buildPrepareCommitMsgHook(): string {
	return `#!/bin/sh
# PI_CO_AUTHORED_BY_HOOK_MARKER
set -u

message_file="$1"

if [ -n "\${PI_CO_AUTHORED_BY_CO_AUTHOR:-}" ] && [ -n "\${PI_CO_AUTHORED_BY_GENERATED_BY:-}" ]; then
  command git \
    -c trailer.co-authored-by.ifExists=addIfDifferent \
    -c trailer.generated-by.ifExists=replace \
    interpret-trailers \
    --in-place \
    --trailer "$PI_CO_AUTHORED_BY_CO_AUTHOR" \
    --trailer "$PI_CO_AUTHORED_BY_GENERATED_BY" \
    "$message_file"
fi

hooks_dir="$(dirname "$0")"
user_hook="$hooks_dir/prepare-commit-msg.pi-user"
# 跳过会注入 Co-Authored-By 的既有 hook(如 dsh 等其它注入器的残留 hook),
# 避免同一提交被多个注入器写入重复 trailer
if [ -x "$user_hook" ] && ! grep -q 'Co-Authored-By' "$user_hook" 2>/dev/null; then
  "$user_hook" "$@"
fi
`;
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}
