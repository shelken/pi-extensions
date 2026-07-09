import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CO_AUTHOR_NAME = "Co-Authored-By";
export const GENERATED_BY_NAME = "Generated-By";

/** Create a session-scoped Git hooks directory for commit trailer injection. */
export function createCommitHookDirectory(): string {
	const hooksDir = mkdtempSync(join(tmpdir(), "pi-co-authored-by-hooks-"));
	const hookPath = join(hooksDir, "prepare-commit-msg");
	writeFileSync(hookPath, buildPrepareCommitMsgHook(), { mode: 0o755 });
	chmodSync(hookPath, 0o755);
	return hooksDir;
}

/** Remove the session-scoped Git hooks directory. */
export function removeCommitHookDirectory(hooksDir: string | undefined): void {
	if (!hooksDir) return;
	rmSync(hooksDir, { recursive: true, force: true });
}

/** Add process-local Git hook configuration and trailer metadata to a bash command. */
export function wrapBashWithCommitHook(
	cmd: string,
	hooksDir: string,
	modelName: string,
	piVersion: string,
): string {
	const coAuthor = `${CO_AUTHOR_NAME}: ${modelName} <noreply@pi.dev>`;
	const generatedBy = `${GENERATED_BY_NAME}: pi ${piVersion}`;

	return `${buildEnvironmentPrefix(hooksDir, coAuthor, generatedBy)}\n${cmd}`;
}

function buildEnvironmentPrefix(
	hooksDir: string,
	coAuthor: string,
	generatedBy: string,
): string {
	return `__pi_co_authored_by_git_config_index="\${GIT_CONFIG_COUNT:-0}"
export PI_CO_AUTHORED_BY_GIT_CONFIG_INDEX="$__pi_co_authored_by_git_config_index"
export PI_CO_AUTHORED_BY_CO_AUTHOR=${shellQuote(coAuthor)}
export PI_CO_AUTHORED_BY_GENERATED_BY=${shellQuote(generatedBy)}
export "GIT_CONFIG_KEY_\${__pi_co_authored_by_git_config_index}=core.hooksPath"
export "GIT_CONFIG_VALUE_\${__pi_co_authored_by_git_config_index}=${escapeDoubleQuotedAssignmentValue(hooksDir)}"
export GIT_CONFIG_COUNT="$((__pi_co_authored_by_git_config_index + 1))"
unset __pi_co_authored_by_git_config_index`;
}

function buildPrepareCommitMsgHook(): string {
	return `#!/bin/sh
set -u

message_file="$1"

if [ -n "\${PI_CO_AUTHORED_BY_CO_AUTHOR:-}" ] && [ -n "\${PI_CO_AUTHORED_BY_GENERATED_BY:-}" ]; then
  git \
    -c trailer.co-authored-by.ifExists=addIfDifferent \
    -c trailer.generated-by.ifExists=replace \
    interpret-trailers \
    --in-place \
    --trailer "$PI_CO_AUTHORED_BY_CO_AUTHOR" \
    --trailer "$PI_CO_AUTHORED_BY_GENERATED_BY" \
    "$message_file"
fi

if [ -n "\${PI_CO_AUTHORED_BY_GIT_CONFIG_INDEX:-}" ]; then
  __pi_config_index="$PI_CO_AUTHORED_BY_GIT_CONFIG_INDEX"
  unset "GIT_CONFIG_KEY_$__pi_config_index"
  unset "GIT_CONFIG_VALUE_$__pi_config_index"
  export GIT_CONFIG_COUNT="$__pi_config_index"
fi

original_hooks_path="$(git config --get core.hooksPath || true)"
if [ -n "$original_hooks_path" ]; then
  case "$original_hooks_path" in
    /*) original_hook="$original_hooks_path/prepare-commit-msg" ;;
    *) original_hook="$(git rev-parse --show-toplevel)/$original_hooks_path/prepare-commit-msg" ;;
  esac
else
  original_hook="$(git rev-parse --git-path hooks/prepare-commit-msg)"
fi

if [ -x "$original_hook" ] && [ "$original_hook" != "$0" ]; then
  "$original_hook" "$@"
fi
`;
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function escapeDoubleQuotedAssignmentValue(value: string): string {
	return value.replace(/[\\"$`]/g, "\\$&");
}
