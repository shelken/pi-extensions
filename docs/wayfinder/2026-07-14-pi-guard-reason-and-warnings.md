# pi-guard：默认 reason 与配置失败警告（冻结）

- **日期**：2026-07-14
- **票**：[敲定默认 reason 与配置失败警告的落点](https://github.com/shelken/pi-extensions/issues/9)

## 1. 通道分工

| 通道 | Agent 可见 | 用户可见 | 用途 |
|---|---|---|---|
| `{ block: true, reason }` | 是（error tool result） | 是（transcript） | 硬禁说明 |
| `ctx.ui.notify` | 否 | 是（TUI） | 配置失败等运维警告 |
| `console.error` | 否 | 是（终端） | 配置失败日志 |

## 2. 硬禁 `reason` 选择顺序

对命中的那条规则：

1. 若规则自带非空 `reason` → **只用**该字符串  
2. 否则若最终 `default_reason` 非空（用户配置合并后）→ **只用**该字符串  
3. 否则用内置模板：

```
blocked by pi-guard: <kind> matched <value>
```

| 占位 | 取值 |
|---|---|
| `kind` | `command` 或 `path` |
| `value` | 命中规则的配置 value（如 `rm -rf /`、`~/.ssh/*`），**不是**展开后的绝对路径 |

示例：

- `blocked by pi-guard: command matched rm -rf /`
- `blocked by pi-guard: path matched ~/.ssh/*`

**不**在用户自定义 reason 后追加 `(kind matched value)`。

硬禁时 **不** 额外 `notify`（避免双通道吵）。

## 3. `default_reason` 合并（与 schema 一致）

```
default_reason = undefined  # 触发内置模板
if global 写了 default_reason → 用之
if project 写了 default_reason → 覆盖
```

空字符串视为未写。

## 4. 配置失败（fail-open）

触发：文件存在但 YAML 解析失败、或读文件 IO 错误。

行为：

1. **该层**配置视为空（不阻断其它层 / 内置）  
2. `console.error` 一行  
3. 在配置加载完成时（推荐 `session_start`，避免 factory 重 IO；若加载推迟到首次 `tool_call`，则首次失败时 notify 一次）调用：

   `ctx.ui.notify(message, "error")`

4. **不**注入 agent 上下文，**不**因此 block 任何 tool  

文案模板：

```
pi-guard: failed to load <abs-path>: <error>; layer ignored (fail-open)
```

同一路径同一 session 只警告一次。

单项规则跳过（空 string、坏 object）→ 仅 `console.error`（或 debug），**不必** notify，避免刷屏。

## 5. 缺失文件

文件不存在 → 静默当空，无警告。

## 6. 实现检查

- [ ] block 必带非空 `reason`（三选一来源）  
- [ ] 自定义 reason 不拼接模板  
- [ ] 坏 YAML：fail-open + console + 一次 error notify  
- [ ] 硬禁不 notify  
- [ ] agent 仅通过 tool error 感知拦截  
