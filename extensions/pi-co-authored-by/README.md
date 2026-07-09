# pi-co-authored-by

A [Pi](https://github.com/earendil-works/pi) extension that automatically appends git trailers to commit messages when the agent runs Git commits. Adds the model name and pi version so you always know which AI helped write the code.

Forked from [bruno-garcia/pi-co-authored-by](https://github.com/bruno-garcia/pi-co-authored-by).

## Features

**Co-Authored-By trailer** — Credits the model that helped write the code:

```text
Co-Authored-By: Claude Sonnet 4 <noreply@pi.dev>
```

**Generated-By trailer** — Records which version of Pi was used:

```text
Generated-By: pi 0.63.2
```

**Example commit:**

```text
fix: resolve null pointer

Co-Authored-By: Claude Sonnet 4 <noreply@pi.dev>
Generated-By: pi 0.63.2
```

## Requirements

- [Pi](https://github.com/earendil-works/pi) coding agent v0.74.1 or newer

## Install

```bash
pi install npm:pi-co-authored-by
```

Or try it without installing:

```bash
pi -e npm:pi-co-authored-by
```

## How it works

The extension creates a session-scoped temporary `prepare-commit-msg` hook outside the repository. Each bash tool call gets process-local Git configuration that points Git at that temporary hook and passes the current model metadata through environment variables.

When a Git commit happens, Git calls the temporary hook. The hook appends trailers to Git's commit message file with [`git interpret-trailers`](https://git-scm.com/docs/git-interpret-trailers), then runs the repository's original `prepare-commit-msg` hook if one exists.

The extension does not:

- modify repository Git config,
- install permanent hooks,
- write plugin files into `.git/hooks`,
- parse shell command text to guess whether a command is a commit.

| What | Value |
|------|-------|
| `Co-Authored-By` | Model name (e.g., `Claude Sonnet 4`) |
| `Generated-By` | Pi version (e.g., `pi 0.52.12`) |

Trailer behavior:

- `Co-Authored-By` is added only when the same value is not already present.
- `Generated-By` is replaced if it already exists, avoiding duplicate tool-version trailers.

## Supported command shapes

Because the extension uses Git's commit hook lifecycle, common commit shapes work without command-specific parsing:

```bash
git commit -m "message"
/usr/bin/git commit -m "message"
command git commit -m "message"
sh -c 'git commit -m "message"'
git commit -F message.txt
git commit --amend --no-edit
git commit -m "$(cat <<'EOF'
message
EOF
)"
```

Non-commit commands such as `git add`, `git status`, and `git log` keep their normal behavior.

## Existing repository hooks

If the repository already has a `prepare-commit-msg` hook, the extension runs it after adding trailers. This includes:

- the default `.git/hooks/prepare-commit-msg`,
- absolute `core.hooksPath`,
- relative `core.hooksPath` resolved from the repository root.

If the repository hook fails, the commit fails.

## Known limits

The extension relies on environment variables inherited by the bash process. It does not cover commands that intentionally remove that environment, such as `env -i git commit`, or commands that explicitly override Git's hooks path for the commit process.

## Development

```bash
bun install
bun --filter pi-co-authored-by test
```

## License

MIT
