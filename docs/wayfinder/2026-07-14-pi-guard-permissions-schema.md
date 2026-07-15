# pi-guard：permissions.yaml 配置 schema（冻结）

- **日期**：2026-07-14
- **票**：[冻结 permissions.yaml 配置 schema](https://github.com/shelken/pi-extensions/issues/6)
- **状态**：冻结（实现必须遵循；改动需新决策）

## 1. 文件位置与发现

| 层 | 路径 |
|---|---|
| 全局 | `~/.pi/agent/permissions.yaml` |
| 项目 | `.pi/permissions.yaml`（相对项目根，与 `.pi/settings.json` 同级） |

规则：

- **只认** 文件名 `permissions.yaml`（不认 `.yml`、不认无扩展名）
- 某层文件不存在 → 该层视为空配置
- 解析失败 → **该层 fail-open**（当层当空）+ 明显警告（文案见后续 UX 票；此处只定语义）
- 未知顶层键 → **忽略**（不失败）
- 编码：UTF-8

## 2. 顶层字段

全部可选。

| 键 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `default_reason` | string | 见 UX 票；未写时用内置默认文案 | 规则未自带 `reason` 时使用 |
| `deny_commands` | array | `[]` | 命令禁止规则（叠加在内置之上，见合并） |
| `deny_paths` | array | `[]` | 路径禁止规则（叠加在内置之上） |

禁止其它顶层键产生行为（可存在，忽略）。

## 3. 列表项形状

### 3.1 `deny_commands` 元素

二选一：

```yaml
# A. 字符串 → pattern；reason = default_reason（或内置默认）
- "curl *| bash"

# B. 对象
- pattern: "npm publish"
  reason: "禁止直接 publish"   # 可选
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `pattern` | 对象形必填 | 非空 string；匹配语义见命令匹配票/Notes（子串/`*`） |
| `reason` | 否 | 非空 string；缺省用 `default_reason` |

### 3.2 `deny_paths` 元素

```yaml
- "~/.specific.zsh"

- path: "~/.ssh/*"
  reason: "私钥目录禁止读写"
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `path` | 对象形必填 | 非空 string |
| `reason` | 否 | 同命令 |

### 3.3 规范化（加载时）

对每个元素：

1. 若是 string：trim 首尾空白；空串 → **跳过该项** + 警告
2. 若是 object：
   - 命令：必须有非空 `pattern`（trim 后）；缺/空 → 跳过 + 警告
   - 路径：必须有非空 `path`；缺/空 → 跳过 + 警告
   - 未知子键（如 `foo:`）→ 忽略
   - `reason` 若存在：trim；空串视为未提供
3. 其它 YAML 类型（number/bool/null/array）→ 跳过 + 警告

加载后统一成内部结构：

```ts
type Rule = { value: string; reason?: string; /* value = pattern 或 path */ }
```

## 4. 减号（移除）语法

**仅允许出现在 string 元素**上：

```yaml
deny_commands:
  - "-rm -rf"          # 从当前结果中移除 pattern 全等于 "rm -rf" 的规则

deny_paths:
  - "-~/.aws/*"        # 移除 path 全等于 "~/.aws/*" 的规则
```

规则：

| 点 | 约定 |
|---|---|
| 识别 | trim 后以 **单个** `-` 开头，且后面还有内容：`^-(.+)$` |
| 目标串 | 捕获组 trim 后的字符串（`"rm -rf"`） |
| 匹配 | 与已有规则的 `value` **字符串全等**（不做 glob、不大小写折叠） |
| 对象形 | **禁止**用减号；不能写 `pattern: "-rm -rf"` 表示移除（这会被当成 pattern 字面量 `-rm -rf`） |
| 无匹配 | 无操作（不报错；可选 debug 日志，非必须） |
| 字面想禁以 `-` 开头的命令 | 用对象形：`pattern: "-something"`（极少见） |

说明：以 `--` 开头的 string（如 `"--flag"`）**不是**减号语法（只有「首字符一个 `-` 且用于移除列表项」的约定；`--` 整串作为 pattern 加入）。实现时：仅当 `s.startsWith("-") && !s.startsWith("--")` 且去掉一个 `-` 后非空 → 移除；否则若 `s.startsWith("-")` 为 pattern 字面？

更干净的冻结：

- **减号语法**：整项 trim 后匹配 `^-(.+)$`，且 **不** 以 `---` 之类复杂化；`^-` 后 capturen 为 target
- 问题：`"-rf"` 会变成移除 `rf`；用户要禁止字面 `-rf` 用对象 `{pattern: "-rf"}`

冻结实现判定：

```
trimmed = trim(item)
if typeof item == string && trimmed.startsWith("-") && trimmed.length > 1:
  action = remove
  key = trim(trimmed.slice(1))
else:
  action = add
```

因此 string `"-rm -rf"` → remove `rm -rf`。  
string `"--recursive"` → `startsWith("-")` 为真 → 会被当成 remove `-recursive`。  

**修正冻结（避免误伤 `--`）**：

```
if string && trimmed.startsWith("-") && !trimmed.startsWith("--") && trimmed.length > 1:
  remove(trim(trimmed.slice(1)))
```

- `"-rm -rf"` → remove `rm -rf`
- `"--recursive"` → **add** pattern `--recursive`
- `"-" ` → 无效，跳过

对象 `{pattern: "-rm -rf"}` → **add** 字面 pattern（极少需要）。

## 5. 合并算法（与 Notes 一致，此处写死伪码）

```
rules = clone(builtins)          # Rule[]，来自内置清单票
rules = apply_layer(rules, global_file)
rules = apply_layer(rules, project_file)
```

`apply_layer(current, layer)`：

```
for item in layer.deny_commands:  # paths 同理，分两桶
  if item is remove:
    current = current.filter(r => r.value !== item.key)
  else: # add
    # 同 value 已存在：后写覆盖 reason（更新 reason；value 不重复）
    upsert(current, { value, reason })
```

`default_reason` 合并：

```
default_reason = builtin_default
if global.default_reason set: default_reason = global
if project.default_reason set: default_reason = project
```

规则缺 `reason` 时，命中使用**最终** `default_reason`（不是加载当层的）。

## 6. 完整示例

### 全局 `~/.pi/agent/permissions.yaml`

```yaml
default_reason: "blocked by pi-guard"

deny_commands:
  - "curl *| bash"
  - pattern: "npm publish"
    reason: "禁止未审 publish"

deny_paths:
  - "~/.specific.zsh"
  - path: "~/.ssh/*"
    reason: "SSH 密钥禁止 agent 读写"
```

### 项目 `.pi/permissions.yaml`

```yaml
# 关掉某条内置/全局
deny_commands:
  - "-curl *| bash"
  - "pnpm publish"

deny_paths:
  - "-~/.specific.zsh"          # 若项目必须读它（不推荐，但机制允许）
  - path: ".env"
    reason: "项目本地 secrets"
```

### 生效直觉

1. 内置极简清单  
2. 全局加上 curl/npm/`~/.specific.zsh`/`~/.ssh/*`  
3. 项目去掉 `curl *| bash` 与 `~/.specific.zsh`，加上 `pnpm publish` 与 `.env`

## 7. 非目标（schema 不做）

- JSON / TOML 配置
- `permissions.yml` 别名
- allow 列表、risk 分、交互放行
- 在 YAML 里嵌正则 flag、深度参数等

## 8. 实现检查清单（给实现 session）

- [ ] 只读上述两个路径  
- [ ] YAML 解析失败 → 该层空 + 警告  
- [ ] 三键 schema；未知键忽略  
- [ ] string/object 两种 list item  
- [ ] 减号：`^-` 且非 `--` 前缀  
- [ ] 合并：builtins → global → project；同 value upsert reason  
- [ ] 匹配语义不在本文件（见 path/command 语义票）  
