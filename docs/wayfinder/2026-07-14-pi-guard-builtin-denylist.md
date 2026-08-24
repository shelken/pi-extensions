# pi-guard：内置 deny 清单

- **日期**：2026-08-24
- **票**：[扩充内置凭据规则并建立隔离攻击回归测试](https://github.com/shelken/pi-extensions/issues/42)
- **档位**：极简；用户可用 `"-…"` 按 value 全等移除任一项

## deny_commands（真正内置）

| pattern | 用意 |
|---|---|
| `rm -rf /` | 禁对根的递归删除（短语；不中 `/tmp`；`/*` 因 `*` 算边界仍中） |
| `rm -rf ~` | 禁对 home 的递归删除（短语；不中 `~/…`） |
| `find /` | 禁从根瞎找（短语；不中 `find /Users/…`） |
| `find ~` | 禁从 home 瞎找（短语；不中 `find ~/Code/…`） |
| `env` | 禁一次输出全部环境变量；`env NAME=value command` 仍放行 |
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
| `~/.netrc` | 网络客户端凭据 |
| `~/.pypirc` | Python 包仓库凭据 |
| `~/.config/gh/hosts.yml` | GitHub CLI 凭据 |
| `~/.config/hub` | Hub CLI 凭据 |
| `~/.config/gcloud/application_default_credentials.json` | Google Cloud ADC 凭据 |
| `~/.config/doctl/config.yaml` | DigitalOcean CLI 凭据 |
| `~/.kube/config` | Kubernetes 集群凭据 |
| `~/.docker/config.json` | 容器仓库凭据 |
| `~/.azure/accessTokens.json` | Azure 访问令牌 |
| `~/.bash_history` | Bash 历史 |
| `~/.zsh_history` | Zsh 历史 |

## 默认 reason

内置 **不** 吃 `default_reason`。回显 `command|path: <value>`。用户 upsert 同 value 后变为 user 规则。
