# pi-guard：内置 deny 清单（冻结）

- **日期**：2026-07-14（短语边界匹配修订：会话内）
- **票**：[冻结内置 deny 命令与路径清单](https://github.com/shelken/pi-extensions/issues/7)
- **档位**：极简；用户可用 `"-…"` 按 value 全等移除任一项

## deny_commands（真正内置）

| pattern | 用意 |
|---|---|
| `rm -rf /` | 禁对根的递归删除（短语；不中 `/tmp`；`/*` 因 `*` 算边界仍中） |
| `rm -rf ~` | 禁对 home 的递归删除（短语；不中 `~/…`） |
| `find /` | 禁从根瞎找（短语；不中 `find /Users/…`） |
| `find ~` | 禁从 home 瞎找（短语；不中 `find ~/Code/…`） |
| `curl *\| bash` | pipe-to-shell（显式 `*`；有空格） |
| `curl *\|bash` | 同上，无空格 |
| `wget *\| sh` | 同上 |
| `wget *\|sh` | 同上 |

### 匹配语义（命令）

- **无 `*`**：**短语边界**——左右须为串边界或 shell 分隔符（含命令中的 `*`）；**不是**前缀 includes  
  - `git add .` ✓ / `git add .agents/…` ✗  
  - `find ~` ✓ / `find ~/Code` ✗  
  - `rm -rf /` ✓ / `rm -rf /*` ✓ / `rm -rf /tmp` ✗  
- **有 `*`**：用户显式通配，子串 glob（要前缀必须自己写 `*`）

### 明确不内置

- 笼统 `rm -rf` / `rm -r`
- `npm publish` / `git push --force` / `sudo`
- `rm -rf ~/*`（短语 `rm -rf ~` 不覆盖；加 `*` 规则会 glob 吃掉 `~/Code`，故不内置）

## deny_paths（真正内置）

| path | 用意 |
|---|---|
| `~/.ssh/*` | SSH 密钥与配置 |
| `~/.aws/*` | AWS 凭据 |
| `~/.gnupg/*` | GPG |
| `~/.specific.zsh` | 用户点名的机密 shell 配置 |

## 默认 reason

内置 **不** 吃 `default_reason`。回显 `command|path: <value>`。用户 upsert 同 value 后变为 user 规则。
