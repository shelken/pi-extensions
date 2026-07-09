/**
 * Pure logic for detecting git commit commands and wrapping git with trailers.
 * Separated from the pi extension API for testability.
 */

// 变更原因：检测逻辑和注入 wrapper 必须共用同一组选项，避免两边支持范围漂移。
const GIT_GLOBAL_OPTIONS_WITH_VALUE = [
	"-c",
	"-C",
	"--config-env",
	"--exec-path",
	"--git-dir",
	"--work-tree",
	"--namespace",
] as const;

const GIT_GLOBAL_FLAG_OPTIONS = [
	"--bare",
	"--no-pager",
	"--paginate",
	"--no-replace-objects",
	"--literal-pathspecs",
	"--glob-pathspecs",
	"--noglob-pathspecs",
	"--icase-pathspecs",
	"--no-optional-locks",
] as const;

const GIT_GLOBAL_VALUE_OPTION_PATTERN = `(?:${GIT_GLOBAL_OPTIONS_WITH_VALUE.map(escapeRegex).join("|")})(?:=|\\s+)\\S+`;
const GIT_GLOBAL_FLAG_OPTION_PATTERN = `(?:${GIT_GLOBAL_FLAG_OPTIONS.map(escapeRegex).join("|")})`;
const GIT_GLOBAL_OPTION_PATTERN = `(?:${GIT_GLOBAL_VALUE_OPTION_PATTERN}|${GIT_GLOBAL_FLAG_OPTION_PATTERN})`;
const GIT_COMMAND_PATTERN = String.raw`(?:git|/[^\s;&|]+/git)`;
const GIT_COMMIT_COMMAND_PATTERN = new RegExp(
	`(?:^|[;&|\\n])\\s*(?:rtk\\s+)?${GIT_COMMAND_PATTERN}(?:\\s+${GIT_GLOBAL_OPTION_PATTERN})*\\s+commit(?:\\s|$)`,
);
const BASH_GIT_GLOBAL_OPTIONS_WITH_VALUE = buildBashWordList(
	GIT_GLOBAL_OPTIONS_WITH_VALUE,
);
const BASH_GIT_GLOBAL_FLAG_OPTIONS = buildBashWordList(GIT_GLOBAL_FLAG_OPTIONS);
const BASH_ATTACHED_GIT_GLOBAL_OPTION_CONDITION = GIT_GLOBAL_OPTIONS_WITH_VALUE.map(
	toBashAttachedValueCondition,
).join(" || ");

/** Check if a command may contain a direct `git commit` invocation. */
export function containsGitCommit(cmd: string): boolean {
	const normalized = cmd.replace(/\\\n/g, " ");
	// 变更原因：旧检测会被 `git diff ...; echo commit` 误触发，导致非提交命令也被注入 wrapper。
	// 变更原因：RTK 会把 `git commit` 重写为 `rtk git commit`，需要匹配 rtk 前缀。
	return GIT_COMMIT_COMMAND_PATTERN.test(normalized);
}

/** Build a bash command that appends trailers to direct `git commit` calls. */
export function wrapGitWithTrailers(
	cmd: string,
	modelName: string,
	piVersion: string,
): string {
	const coAuthor = `Co-Authored-By: ${modelName} <noreply@pi.dev>`;
	const generatedBy = `Generated-By: pi ${piVersion}`;

	// 变更原因：RTK 和绝对路径 git 都会绕过 `git()` wrapper；只归一化真实命令位置，避免改写提交参数里的普通文本。
	const effectiveCmd = cmd.replaceAll(
		/(^|[;&|\n]\s*)(?:rtk\s+)?(?:git|\/[^\s;&|]+\/git)\b/g,
		"$1git",
	);

	return `${buildGitWrapper(coAuthor, generatedBy)}\n${effectiveCmd}`;
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildBashWordList(values: readonly string[]): string {
	return ` ${values.join(" ")} `;
}

function toBashAttachedValueCondition(option: string): string {
	if (option.startsWith("--")) return `"$1" == ${option}=*`;
	return `"$1" == ${option}?*`;
}

function buildGitWrapper(coAuthor: string, generatedBy: string): string {
	return `git() (
  set +u
  local -a __pi_git_original=("$@")
  local -a __pi_git_globals=()
  local __pi_git_value_globals="${BASH_GIT_GLOBAL_OPTIONS_WITH_VALUE}"
  local __pi_git_flag_globals="${BASH_GIT_GLOBAL_FLAG_OPTIONS}"

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
    elif [[ ${BASH_ATTACHED_GIT_GLOBAL_OPTION_CONDITION} ]]; then
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

