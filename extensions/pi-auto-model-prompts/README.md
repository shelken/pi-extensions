# pi-auto-model-prompts

按当前模型 ID 读本地 Markdown，在 `before_agent_start` 追加到 system prompt 末尾（标题：`# AUTO MODEL PROMPT(模型特别规则)`）。

## 功能

- 项目 prompt 优先，全局其次；同一目录只取一个非空匹配
- 匹配：精确 ID、`前缀*`、兜底 `*.md`（更长前缀优先）
- 空文件忽略；内容会 `trim`

## 安装

```bash
pi install npm:@shelken/pi-auto-model-prompts
```

装好后 `/reload`。

## 配置

路径（项目覆盖全局）：

```text
.pi/extensions/pi-auto-model-prompts/config.json
{pi-agent-dir}/extensions/pi-auto-model-prompts/config.json
```

```json
{
  "enabled": true,
  "liveReload": false
}
```

| 字段 | 默认 | 作用 |
|---|---|---|
| `enabled` | `true` | 是否注入 |
| `liveReload` | `false` | `false`：按模型缓存，改文件后需 `/reload`；`true`：每轮重读 |

## Prompt 文件

```text
.pi/auto-model-prompts/              # 项目
{pi-agent-dir}/auto-model-prompts/  # 全局
```

| 文件名 | 匹配 |
|---|---|
| `gpt-5.5.md` | 模型 ID 完全一致（忽略大小写） |
| `kimi*.md` | 前缀匹配 |
| `*.md` | 任意模型，优先级最低 |

## 验证

```bash
bun --filter @shelken/pi-auto-model-prompts test
```
