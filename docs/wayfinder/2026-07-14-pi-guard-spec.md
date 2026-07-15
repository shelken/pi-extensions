# pi-guard 可开工规格

- **日期**：2026-07-14
- **地图**：[pi-guard：硬禁命令与路径的规格地图](https://github.com/shelken/pi-extensions/issues/4)
- **汇总票**：[汇总 pi-guard 可开工规格资产](https://github.com/shelken/pi-extensions/issues/11)
- **状态**：可开工（本文件为准；分题资产为论据）

## 0. 一句话

pi 扩展 **pi-guard**：硬禁止 agent 的危险 bash 与机密路径读写编辑；配置 YAML、全局+项目合并、`-` 移除内置；无放行交互、无评分。

## 1. 包与落位（实现默认）

| 项 | 值 |
|---|---|
| monorepo 目录 | `extensions/pi-guard` |
| package name | `@shelken/pi-guard`（`publishConfig.access: public`；开发期可 `private: true` 按仓惯例） |
| 入口 | 子包 `index.ts` / package `pi` 或 main 按 monorepo 其它扩展 |
| 根登记 | 同步根 `package.json` → `pi.extensions` 与根 `README` 表 |
| 模板 | `nix flake new extensions/pi-guard -t github:shelken/nix-templates#pi-extension`（若仍适用） |
| 参考 | 本机 `pi-defender`（形状参考，不抄全量） |
| factory | 禁网络与同步重 IO；配置加载放 `session_start` 或首次 `tool_call` 惰性一次 |

与 **pi-defender 同时启用**：允许；两者独立 `tool_call`，任一 block 即停。文档一句「不必双挂，功能重叠」即可，不做互斥代码。

## 2. 拦截面

### 2.1 Hook

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // session_start: load config once, notify on failure
  pi.on("tool_call", async (event, ctx) => { /* ... */ });
}
```

- 使用 `isToolCallEventType`，不要 `event.toolName ===`
- Block：`{ block: true, reason: string }`（reason 必非空）
- 不 mutate `event.input`
- 不处理 `user_bash`（人类 `!`）

### 2.2 工具与字段

| 工具 | 检查 |
|---|---|
| `bash` | ① `deny_commands` vs `input.command` ② `deny_paths` 扫 `input.command` 全文 |
| `read` / `write` / `edit` | `deny_paths` vs `input.path` |

- 只认 `path`（不认 `file_path`）；空 path 跳过
- **不拦** `grep` / `find` / `ls`（已知缺口，v1 不做）

证据：`docs/wayfinder/2026-07-14-pi-guard-tool-call-surface.md`

## 3. 配置

### 3.1 路径

| 层 | 文件 |
|---|---|
| 全局 | `~/.pi/agent/permissions.yaml` |
| 项目 | `.pi/permissions.yaml` |

只认该文件名；无文件 = 空层；UTF-8。

### 3.2 Schema

```yaml
default_reason: string          # 可选；项目覆盖全局
deny_commands: array            # 可选
deny_paths: array               # 可选
```

列表项：

- 命令：`string` 或 `{ pattern: string, reason?: string }`
- 路径：`string` 或 `{ path: string, reason?: string }`
- 未知顶层键 / 未知子键：忽略
- 坏项：跳过 + `console.error`

减号（仅 string）：

```
trimmed.startsWith("-") && !trimmed.startsWith("--") && length > 1
  → remove value === trim(trimmed.slice(1))  # 全等
```

`--foo` 是 **add** pattern，不是 remove。

### 3.3 合并

```
commands = apply(apply(builtins.commands, global), project)
paths    = apply(apply(builtins.paths, global), project)
default_reason = project ?? global ?? undefined
```

`apply`：remove 按 value 全等删；add 同 value **upsert reason**。

完整 schema：`docs/wayfinder/2026-07-14-pi-guard-permissions-schema.md`  
样例：`docs/wayfinder/samples/permissions.{global,project}.example.yaml`

## 4. 内置清单（代码常量）

### deny_commands

```
rm -rf /
rm -rf ~
find /
find ~
curl *| bash
curl *|bash
wget *| sh
wget *|sh
```

### deny_paths

```
~/.ssh/*
~/.aws/*
~/.gnupg/*
~/.specific.zsh
```

无 per-rule 内置 reason。用户 `-value` 可移除。

无 `*` 为短语边界匹配（非前缀 includes）；前缀/通配必须显式写 `*`。

详见：`docs/wayfinder/2026-07-14-pi-guard-builtin-denylist.md`

## 5. 匹配语义

### 5.1 命令 pattern

- 大小写敏感
- 无 `*`：**短语匹配**——pattern 在 command 中出现，且左右为边界（串首/尾，或 shell 分隔符空白/`|;&<>(){}[]`/`'"` 等）；`git add .` ⊄ `git add .agents/…`，`find ~` ⊄ `find ~/Code`
- 有 `*`：用户显式通配；`*` → 任意字符（含 `/`、空格）；在 command 上 **子串** 通配命中
- 不解析 shell、不拆 token、不管引号/`$var`/`bash -c` 混淆（v1 不做）

### 5.2 路径

`norm(p, cwd)`：

1. trim  
2. `~` / `~/…` → `HOME`（不支持 `~user`）  
3. 相对 → `path.resolve(cwd, …)`（同 pi `resolveToCwd`）  
4. `path.normalize`  
5. **不** realpath；大小写敏感  

通配：仅 `*`，**可跨 `/`**；无 `**`。

**read/write/edit**：`glob_match(norm(input.path), absolute_form(rule))` 全路径匹配。

**bash 扫路径**：每条 path 规则两根针——① 配置原文 ② 绝对形；与命令侧同一套 `textMatchesPattern`（含路径根边界）。

详见：`docs/wayfinder/2026-07-14-pi-guard-path-match-semantics.md`

## 6. reason 与警告

### 6.1 硬禁 reason（agent 可见）

detail 优先级：规则 `reason` →（仅非 builtin）`default_reason` → 无 detail。字段均带前缀：

```
! FORBIDDEN <HEADER>
command: <value>   # 或 path: <value>
reason: <detail>   # 可选
```

| 来源 | header | 目标行 | reason 行 |
|---|---|---|---|
| 规则 `reason` | `BY USER` | `command|path: value` | `reason: ` 用户文案 |
| 用户规则 + `default_reason` | `COMMAND` 或 `PATH` | 同上 | `reason: ` default |
| 内置（无 per-rule reason） | `COMMAND` 或 `PATH` | 同上 | （无；**不**吃 default_reason） |

硬禁 **不** `notify`。

### 6.2 配置失败 fail-open

- 该层当空；内置与其它层仍生效  
- `console.error`  
- 一次 `ctx.ui.notify(msg, "error")`（session 内同路径一次）  
- **不** 写入 agent 上下文  

```
pi-guard: failed to load <abs-path>: <error>; layer ignored (fail-open)
```

缺文件：静默。

详见：`docs/wayfinder/2026-07-14-pi-guard-reason-and-warnings.md`

## 7. 建议模块切分（实现提示，非强制）

保持浅：

```
index.ts          # factory + session_start + tool_call
config.ts         # load YAML, merge, minus, builtins
match.ts          # command + path match, norm
# 可选 reasons 内联 match/block 即可
```

依赖：YAML 解析用仓内已有或最小依赖（如 `yaml`）；不引 defender。

## 8. 测试约束（必须写入 `extensions/pi-guard/AGENTS.md`）

1. **禁止**在测试中执行真实危险命令（如真 `rm -rf /`、真 pipe-to-shell、真读用户 `~/.ssh`）  
2. 匹配测试只对 **纯函数**（`matchCommand` / `matchPath` / `applyLayer`）喂字符串  
3. 集成测用 **临时目录 / 假 HOME / 隔离 fixture**；不得碰开发者真实 home 机密路径  
4. 用例命名写清「模拟输入」，断言 block/reason，不调用真 shell 破坏性操作  

## 9. 子包 AGENTS.md 最低内容

```markdown
# pi-guard

硬禁止 agent 危险 bash 与机密路径（read/write/edit）。

## 基本约束

- 测试禁止使用真实危险命令；匹配逻辑用纯函数 + 隔离 fixture
- 配置路径：`~/.pi/agent/permissions.yaml` 与 `.pi/permissions.yaml`
- factory 不读盘；加载在 session_start 或首次 tool_call
```

## 10. 实现检查清单

- [ ] monorepo 子包 + 根 `pi.extensions` + README 行  
- [ ] builtins 常量与 §4 一致  
- [ ] 配置加载/合并/减号与 §3 一致  
- [ ] tool_call 四工具与 §2 一致  
- [ ] 匹配与 §5 一致  
- [ ] reason / fail-open 与 §6 一致  
- [ ] 子包 AGENTS.md 含测试约束  
- [ ] `just verify` + 子包测试  
- [ ] 有行为变更时写 changeset  
- [ ] 手工：`pi` 挂扩展后 bash/read 命中内置应 block  

## 11. 明确不做（v1）

- 交互放行 / yolo / 风险分 / 系统 prompt 策略  
- 正则命令、gitignore 路径、`**`、symlink realpath  
- 目录深度特判 `rm`  
- `permissions.yml` / JSON / TOML  
- 拦 `grep`/`find`/`ls`/`user_bash`  
- Windows 路径  
- shell AST / 反混淆  

## 12. 分题资产索引

| 主题 | 文件 |
|---|---|
| tool_call | `docs/wayfinder/2026-07-14-pi-guard-tool-call-surface.md` |
| schema | `docs/wayfinder/2026-07-14-pi-guard-permissions-schema.md` |
| 内置清单 | `docs/wayfinder/2026-07-14-pi-guard-builtin-denylist.md` |
| 路径语义 | `docs/wayfinder/2026-07-14-pi-guard-path-match-semantics.md` |
| reason/警告 | `docs/wayfinder/2026-07-14-pi-guard-reason-and-warnings.md` |
| 样例 | `docs/wayfinder/samples/*.example.yaml` |
| **本规格** | `docs/wayfinder/2026-07-14-pi-guard-spec.md` |
