# pi-auto-model-prompts

按当前模型 ID 读本地 Markdown，在 `before_agent_start` 追加到 system prompt 末尾（标题：`# AUTO MODEL PROMPT(模型特别规则)`）。

## 功能

- 项目根优先，宿主 agent 目录其次，另一宿主 agent 目录兜底；每个目录内只取一个非空命中
- 匹配前只取模型 ID 最后一个 `/` 后的部分
- 匹配：精确 ID、`前缀*`、`*包含*`、兜底 `*`
- 空文件忽略；内容会 `trim`

## 安装

```bash
pi install npm:@shelken/pi-auto-model-prompts          # 上游 Pi
omp plugin install npm:@shelken/pi-auto-model-prompts  # Oh My Pi
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
{cwd}/AGENTS.<matcher>.md               # 项目根，优先
{pi-agent-dir}/AGENTS.<matcher>.md      # 宿主 agent 目录
{另一宿主 agent 目录}/AGENTS.<matcher>.md  # 兜底
```

| 文件名 | 匹配 |
|---|---|
| `AGENTS.gpt-5.5.md` | 模型 ID 完全一致（忽略大小写） |
| `AGENTS.kimi*.md` | 前缀匹配 |
| `AGENTS.*fixture-alpha*.md` | 包含匹配 |
| `AGENTS.*.md` | 任意模型，优先级最低 |

`AGENTS.md` 本体是宿主规则文件，扩展不读它

## 验证

```bash
bun --filter @shelken/pi-auto-model-prompts test
```
