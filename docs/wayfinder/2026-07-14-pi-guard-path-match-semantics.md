# pi-guard：路径与 bash 全文命中语义（冻结）

- **日期**：2026-07-14
- **票**：[敲定路径与 bash 全文命中的边角语义](https://github.com/shelken/pi-extensions/issues/8)

## 1. 归一化 `norm(p, cwd)`

1. `trim(p)`
2. **`~` 展开**（仅下列形态）：
   - `~` → `HOME`
   - `~/...` → `HOME + "/" + rest`
   - 不支持 `~otheruser`（保持原样，不当作展开）
3. 若结果为相对路径 → 用与 pi `resolveToCwd` 相同方式挂到 `cwd`（Node `path.resolve(cwd, p)` 语义）
4. `path.normalize` 去掉 `.` / `..` 多余分隔
5. **不**调用 `realpath` / **不**解析 symlink
6. 输出：绝对路径字符串；**大小写敏感**

`HOME` 来源：`process.env.HOME`（缺省时实现可跳过 `~` 展开并打警告，该规则仅用未展开针）。

## 2. 通配

- 仅支持 `*`（**可跨 `/`**）
- **不支持** `**`、`?`、字符类
- 匹配前：将规则路径经 `norm` 能确定的字面段归一；`*` 保留为通配
- 实现建议：对「已展开的绝对规则串」做 glob：把 `*` → `.*`，其余 glob 元字符转义，再 `RegExp(^...$)` 或等价全串匹配
- 命令侧 pattern 的 `*` 同语义（任意字符含 `/`）

## 3. read / write / edit

```
candidate = event.input.path
C = norm(candidate, ctx.cwd)
for rule in deny_paths:
  if glob_match(C, absolute_form(rule, ctx.cwd)):
    block(reason)
```

`absolute_form(rule)`：对规则 path 做与 `norm` 相同的 `~`/相对处理，保留 `*`。

无 path / path 空 → 不拦（跳过）。

## 4. bash 全文扫路径

不解析 shell 语法、不拆 token、不处理引号/转义。

对每条 `deny_paths` 规则生成 **针** 列表，在 `event.input.command` 上做命中：

| 针 | 生成方式 |
|---|---|
| 原文针 | `trim(rule.path)`（可含 `~`、`*`） |
| 绝对针 | `absolute_form(rule, ctx.cwd)`（`~`/相对已展开） |

命中定义：

- 针中 **无** `*` → `command.includes(needle)`（大小写敏感）
- 针中 **有** `*` → 将针编译为可跨 `/` 的通配，在 command **子串** 上找是否存在匹配（不必整命令等于针）

任一针命中 → block（reason 取该 path 规则）。

另：bash 仍先/并行走 `deny_commands`（命令 pattern 子串/`*`）；两路任一中即 block。

## 5. 可测规则表

| # | 输入 | 规则 | cwd / HOME | 命中？ |
|---|---|---|---|---|
| 1 | read `~/.ssh/id_rsa` | `~/.ssh/*` | HOME=/Users/u | 是 |
| 2 | read `/Users/u/.ssh/id_rsa` | `~/.ssh/*` | HOME=/Users/u | 是 |
| 3 | read `id_rsa` | `~/.ssh/*` | cwd=/Users/u/.ssh | 是（相对挂 cwd） |
| 4 | read `./secrets/.env` | `.env` | cwd=/proj | 否（归一后不是以 `.env` 为全路径；规则 `.env`→`/proj/.env`） |
| 5 | read `/proj/.env` | `.env` | cwd=/proj | 是 |
| 6 | read `/proj/.ENV` | `.env` | cwd=/proj | 否（大小写敏感） |
| 7 | read `/Users/u/.ssh/id_rsa`（若该路径是 symlink） | `~/.ssh/*` | 按字面路径比 | 是（不看 realpath） |
| 8 | bash `cat ~/.ssh/id_rsa` | `~/.ssh/*` | | 是（原文针） |
| 9 | bash `cat /Users/u/.ssh/id_rsa` | `~/.ssh/*` | HOME=/Users/u | 是（绝对针） |
| 10 | bash `cat '/Users/u/.ssh/id_rsa'` | `~/.ssh/*` | | 是（引号内仍含子串） |
| 11 | bash `echo 'see ~/.ssh/* docs'` | `~/.ssh/*` | | 是（可误伤；接受） |
| 12 | bash `find /` | （path 规则无）靠 deny_commands `find /` | | 是（命令规则） |

## 6. 非目标

- `**` / gitignore 语法
- `~user` 展开
- symlink 真实路径
- 大小写折叠
- shell 词法/AST
- Windows 盘符与 `\` 语义

## 7. 与 schema / 内置清单关系

- 规则 `value` 字符串保持用户/内置写法（如 `~/.ssh/*`），匹配时再展开
- 减号移除仍按 **配置 value 全等**，不按展开后的绝对路径
