# pi-guard：内置 deny 清单（冻结）

- **日期**：2026-07-14（路径根边界修订：会话内）
- **票**：[冻结内置 deny 命令与路径清单](https://github.com/shelken/pi-extensions/issues/7)
- **档位**：极简；用户可用 `"-…"` 按 value 全等移除任一项

## deny_commands（真正内置）

| pattern | 用意 |
|---|---|
| `rm -rf /` | 禁对根的递归删除（不中 `/tmp`；仍中 `/*`） |
| `rm -rf ~` | 禁对 home 的递归删除（不中 `~/…`） |
| `find /` | 禁从根瞎找（不中 `find /Users/…`） |
| `find ~` | 禁从 home 瞎找（不中 `find ~/Code/…`） |
| `curl *\| bash` | pipe-to-shell（`*` 通配；有空格） |
| `curl *\|bash` | 同上，无空格 |
| `wget *\| sh` | 同上 |
| `wget *\|sh` | 同上 |

YAML 等价（内置写在代码里，不必出现在用户文件）：

```yaml
deny_commands:
  - "rm -rf /"
  - "rm -rf ~"
  - "find /"
  - "find ~"
  - "curl *| bash"
  - "curl *|bash"
  - "wget *| sh"
  - "wget *|sh"
```

### 路径根边界（无 `*`）

pattern 以 `/` 或 `~` 结尾时，匹配后若紧跟更长路径则**不中**：

- `rm -rf /` ⊄ `rm -rf /tmp`；仍中 `rm -rf /`、`rm -rf /*`、`rm -rf / && …`
- `find ~` ⊄ `find ~/Code`；仍中 `find ~`、`find ~ -type f`

不以 `/`/`~` 结尾的无 `*` pattern 仍为普通子串 includes。

### 明确不内置（文档示例可写）

- 笼统 `rm -rf` / `rm -r` / `rm --recursive`
- `npm publish` / `git push --force` / `sudo` 等
- 其它 pipe-to-shell 变体（`curl … | zsh` 等）— 用户自加

## deny_paths（真正内置）

| path | 用意 |
|---|---|
| `~/.ssh/*` | SSH 密钥与配置 |
| `~/.aws/*` | AWS 凭据 |
| `~/.gnupg/*` | GPG |
| `~/.specific.zsh` | 用户点名的机密 shell 配置 |

```yaml
deny_paths:
  - "~/.ssh/*"
  - "~/.aws/*"
  - "~/.gnupg/*"
  - "~/.specific.zsh"
```

### 不内置（示例）

- `.env` / `**/.env`
- `~/.netrc` / `**/*.{pem,key}`
- 项目私有路径 — 放项目 `.pi/permissions.yaml`

## 默认 reason

内置项 **不** 自带 per-rule reason，也 **不** 吃 `default_reason`（那只给 global/project 用户规则）。命中回显：`command|path: <value>`，无 reason 行。用户若要给某条内置加文案，用对象形重加同 value（upsert 后变为 user 规则，可写 reason / 吃 default_reason）。

## 移除示例

```yaml
deny_commands:
  - "-find /"          # 允许 agent find /
deny_paths:
  - "-~/.specific.zsh" # 允许碰该文件（不推荐）
```
