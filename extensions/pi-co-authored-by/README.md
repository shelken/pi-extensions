# pi-co-authored-by

A [Pi](https://github.com/earendil-works/pi) extension that automatically appends git trailers to commit messages when the agent runs `git commit`. Adds the model name and pi version so you always know which AI helped write the code.

## Features

**Co-Authored-By trailer** — Credits the model that helped write the code:
```
Co-Authored-By: Claude Sonnet 4 <noreply@pi.dev>
```

**Generated-By trailer** — Records which version of Pi was used:
```
Generated-By: pi 0.63.2
```

**Example commit:**
```
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

You can also install from git:

```bash
pi install git:github.com/bruno-garcia/pi-co-authored-by
```

## How it works

The extension hooks into Pi's `tool_call` event. When a bash command may contain a direct `git commit`, it injects a one-time `git()` shell wrapper for that bash invocation. The wrapper forwards non-commit git commands unchanged and adds Git's native [`--trailer`](https://git-scm.com/docs/git-commit) arguments to direct `git commit` calls.

| What | Value |
|------|-------|
| `Co-Authored-By` | Model name (e.g., `Claude Sonnet 4`) |
| `Generated-By` | Pi version (e.g., `pi 0.52.12`) |

The wrapper uses Git trailer configuration for clean amend behavior:

- `Co-Authored-By` is added only when the same value is not already present.
- `Generated-By` is replaced if it already exists, avoiding duplicate tool-version trailers.

## Supported command shapes

Supported:

```bash
git commit -m "message"
git commit -F - <<'EOF'
message
EOF
git add file && git commit -F - <<'EOF'
message
EOF
git commit -m "message" -- file1 file2
git -c commit.gpgsign=false commit -m "message"
```

Not supported as automatic interception targets:

```bash
command git commit -m "message"
/usr/bin/git commit -m "message"
sh -c 'git commit -m "message"'
"$GIT_BIN" commit -m "message"
```

Those forms bypass the injected `git()` shell function, so the extension leaves them unchanged.

## Development

```bash
npm install
npm test
```

## License

MIT
