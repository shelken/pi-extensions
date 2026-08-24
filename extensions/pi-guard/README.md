# pi-guard

硬禁止 agent 危险 bash 命令与机密路径（`read` / `write` / `edit`）。无交互放行、无风险分。

## 安装

monorepo 本地：根 `pi.extensions` 已包含入口；`settings.json` 的 `packages` 指向本仓即可。

```bash
pi install npm:@shelken/pi-guard
```

## 配置

仅认 `permissions.yaml`（UTF-8）：

| 层 | 路径 |
|---|---|
| 全局 | `{pi-agent-dir}/permissions.yaml`（通常 `~/.pi/agent/permissions.yaml`） |
| 项目 | `.pi/permissions.yaml` |

合并顺序：**内置 → 全局 → 项目**。缺文件静默当空。

### 形状

```yaml
default_reason: "blocked by pi-guard"   # 可选；项目覆盖全局

deny_commands:
  - "npm publish"                       # 字符串 = pattern
  - pattern: "git push -f"
    reason: "禁止强推"
  - "-find ~"                           # 减号：按 value 全等移除（含内置）

deny_paths:
  - "~/.netrc"
  - path: ".env"
    reason: "项目 env 禁止读写"
  - "-~/.specific.zsh"                  # 移除内置路径规则
```

- 减号仅 string 项：`^-` 且非 `--`；对象项不能用减号字段
- 命令侧：按 **shell 简单命令 argv** 匹配（词法/管道拆分/去赋值与 sudo 等包装），不是整行子串。`env` 中 `env`/`sudo env`，不中 `rg '…|env'`/`echo env`。词内 `*` = 槽位 glob（`git add .*`）；含 `|;&` 且带 `*` = 整行 glob（`curl *| bash`）
- **home 展开（入库 + 匹配）**：规则写入时 `~` / `$HOME` / `${HOME}` 物化出当前用户绝对路径副本（如 `find ~` → 额外 `find /Users/you`）；匹配前对 command/path 同样展开，匹配阶段只见绝对路径。`-find ~` 会连同绝对副本一起移除
- 未知顶层键忽略；坏 YAML 该层 fail-open（console + 一次 UI 警告）

同构样例：`docs/wayfinder/samples/permissions.{global,project}.example.yaml`  
完整规格：`docs/wayfinder/2026-07-14-pi-guard-spec.md`

### 内置清单（摘要）

**命令：** `rm -rf /` · `rm -rf ~` · `find /` · `find ~` · `env` · curl/wget pipe-to-shell（有/无空格）

**路径：** SSH、AWS、GPG、常见 CLI 凭据文件与 shell 历史。完整清单见 `src/policy.ts`

## 行为

- 拦：agent `bash`、`read`、`write`、`edit`
- 不拦：人类 `!`（user_bash）、`grep`/`find`/`ls` 工具（v1）
- 命中：`{ block: true, reason }` → agent 可见 tool error（字段均带前缀）：
  - 内置：`! FORBIDDEN COMMAND|PATH\ncommand|path: <value>`（**不**吃 `default_reason`）
  - 用户规则 + `default_reason`：`! FORBIDDEN COMMAND|PATH\ncommand|path: <value>\nreason: <default>`
  - 规则自带 `reason`：`! FORBIDDEN BY USER\ncommand|path: <value>\nreason: <reason>`
- 硬禁不额外 toast；配置失败才 UI error notify

## 开发

```bash
bun --filter @shelken/pi-guard test
cd extensions/pi-guard && bun run audit:security
```

安全审计只使用临时 HOME、合成环境变量和假凭据。输出中的 canary 值会先脱敏
