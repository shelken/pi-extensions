# pi-auto-model-prompts

按当前模型 ID 注入额外 system prompt。在 `before_agent_start` 以 `# AUTO MODEL PROMPT(模型特别规则)` 标题追加到末尾。

## 安装

```bash
pi install npm:@shelken/pi-auto-model-prompts
```

## 配置

可选：

- 项目：`.pi/extensions/pi-auto-model-prompts/config.json`
- 全局：`{pi-agent-dir}/extensions/pi-auto-model-prompts/config.json`

```json
{
  "enabled": true,
  "liveReload": false
}
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 是否注入 |
| `liveReload` | `false` | `true`：每轮重读文件；`false`：按模型缓存，改文件需 `/reload` |

项目级同名字段覆盖全局。

## Prompt 文件

```text
.pi/auto-model-prompts/              # 项目，优先
{pi-agent-dir}/auto-model-prompts/  # 全局
```

文件名（去掉 `.md`）即匹配规则：

| 规则 | 例 | 说明 |
|---|---|---|
| 精确 | `gpt-5.5.md` | 模型 ID 完全一致 |
| 前缀 | `gpt-5.4*.md` / `kimi*.md` | 去掉末尾 `*` 后做前缀；更长前缀优先 |
| 兜底 | `*.md` | 匹配所有模型，优先级最低 |

同一目录只注入**一个**非空匹配。项目目录无匹配才用全局。

## 行为摘要

- `liveReload=false`（默认）：同模型复用缓存，利于 prompt cache；改 `.md` 后 `/reload`
- `liveReload=true`：每轮扫盘，改文件下一轮生效
- 空文件忽略；内容会 `trim`

## 验证

```bash
bun --filter '@shelken/pi-auto-model-prompts' test
```
