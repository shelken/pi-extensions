/**
 * Pure logic for detecting git commit commands and wrapping git with trailers.
 * Separated from the pi extension API for testability.
 */

/** Check if a command may contain a direct `git commit` invocation. */
export function containsGitCommit(cmd: string): boolean {
	const normalized = cmd.replace(/\\\n/g, " ");
	// 变更原因：旧检测会被 `git diff ...; echo commit` 误触发，导致非提交命令也被注入 wrapper。
	return /(?:^|[;&|]\s*)git(?:\s+(?:(?:-[cC]|--config-env|--exec-path|--git-dir|--work-tree|--namespace)(?:=|\s+)\S+|--bare|--no-pager|--paginate|--no-replace-objects|--literal-pathspecs|--glob-pathspecs|--noglob-pathspecs|--icase-pathspecs|--no-optional-locks))*\s+commit(?:\s|$)/.test(
		normalized,
	);
}

/** Build a bash command that appends trailers to direct `git commit` calls. */
export function wrapGitWithTrailers(
	cmd: string,
	modelName: string,
	piVersion: string,
): string {
	const coAuthor = `Co-Authored-By: ${modelName} <noreply@pi.dev>`;
	const generatedBy = `Generated-By: pi ${piVersion}`;

	return `${buildGitWrapper(coAuthor, generatedBy)}\n${cmd}`;
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildGitWrapper(coAuthor: string, generatedBy: string): string {
	return `git() (
  set +u
  local -a __pi_git_original=("$@")
  local -a __pi_git_globals=()
  local __pi_git_value_globals=" -c -C --config-env --exec-path --git-dir --work-tree --namespace "
  local __pi_git_flag_globals=" --bare --no-pager --paginate --no-replace-objects --literal-pathspecs --glob-pathspecs --noglob-pathspecs --icase-pathspecs --no-optional-locks "

  # 变更原因：case 分支终止符曾被执行环境改写成非法语法；用普通 if 链保持注入脚本可解析。
  while (($#)); do
    if [[ "$__pi_git_value_globals" == *" $1 "* ]]; then
      __pi_git_globals+=("$1")
      shift
      if (($# == 0)); then
        command git "\${__pi_git_original[@]}"
        return
      fi
      __pi_git_globals+=("$1")
      shift
    elif [[ "$1" == -c?* || "$1" == -C?* || "$1" == --config-env=* || "$1" == --exec-path=* || "$1" == --git-dir=* || "$1" == --work-tree=* || "$1" == --namespace=* ]]; then
      __pi_git_globals+=("$1")
      shift
    elif [[ "$__pi_git_flag_globals" == *" $1 "* ]]; then
      __pi_git_globals+=("$1")
      shift
    elif [[ "$1" == "commit" ]]; then
      shift
      local -a __pi_git_before_pathspec=()
      local -a __pi_git_after_pathspec=()
      local __pi_git_seen_pathspec=0

      while (($#)); do
        if [[ "$1" == "--" && "$__pi_git_seen_pathspec" == 0 ]]; then
          __pi_git_seen_pathspec=1
          __pi_git_after_pathspec+=("$1")
        elif [[ "$__pi_git_seen_pathspec" == 0 ]]; then
          __pi_git_before_pathspec+=("$1")
        else
          __pi_git_after_pathspec+=("$1")
        fi
        shift
      done

      command git \
        "\${__pi_git_globals[@]}" \
        -c trailer.co-authored-by.ifExists=addIfDifferent \
        -c trailer.generated-by.ifExists=replace \
        commit \
        "\${__pi_git_before_pathspec[@]}" \
        --trailer ${shellQuote(coAuthor)} \
        --trailer ${shellQuote(generatedBy)} \
        "\${__pi_git_after_pathspec[@]}"
      return
    else
      # 变更原因：未知形态不安全改写，必须保持用户原始 git 调用语义。
      command git "\${__pi_git_original[@]}"
      return
    fi
  done

  command git "\${__pi_git_original[@]}"
)`;
}
