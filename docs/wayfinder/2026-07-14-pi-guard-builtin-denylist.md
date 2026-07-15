# pi-guard：内置 deny 清单（冻结）

- **日期**：2026-07-14
- **票**：[冻结内置 deny 命令与路径清单](https://github.com/shelken/pi-extensions/issues/7)
- **档位**：极简；用户可用 `"-…"` 按 value 全等移除任一项

## deny_commands（真正内置）

| pattern | 用意 |
|---|---|
| `rm -rf /` | 禁对根的递归删除（子串：也会命中 `rm -rf /foo`） |
| `rm -rf ~` | 禁对 home 的递归删除（子串：也会命中 `rm -rf ~/…`） |
| `find /` | 禁从根瞎找（子串：也会命中 `find /Users/…`） |
| `find ~` | 禁从 home 瞎找（子串：也会命中 `find ~/Code/…`） |
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

### 已知更严副作用（接受）

在 **子串** 匹配下：

- `rm -rf /` ⊃ `rm -rf /tmp`
- `rm -rf ~` ⊃ `rm -rf ~/Code`
- `find /` ⊃ `find /Users/x`
- `find ~` ⊃ `find ~/Code`

若以后要「只禁恰好 `/` 或 `~` 目标」，需改命令匹配语义（另票），不是改这张表能单独解决的。

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

内置项 **不** 自带 per-rule reason；命中用最终 `default_reason`（见 UX 票）。用户若要区分文案，在自己的配置里用对象形重加同 value（upsert reason）。

## 移除示例

```yaml
deny_commands:
  - "-find /"          # 允许 agent find /
deny_paths:
  - "-~/.specific.zsh" # 允许碰该文件（不推荐）
```
