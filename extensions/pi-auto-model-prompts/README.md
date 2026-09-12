# pi-auto-model-prompts

按当前模型 ID 读本地 Markdown，在 `before_agent_start` 追加到 system prompt 末尾（标题：`# AUTO MODEL PROMPT(模型特别规则)`）。

## 功能

- 项目 `.agents` 优先，全局 `~/.agents` 兜底；每个目录内只取一个非空命中
- 匹配前只取模型 ID 最后一个 `/` 后的部分
- 匹配：精确 ID、`前缀*`、`*包含*`、兜底 `*`，均忽略大小写（文件名前缀 `AGENTS.` 也忽略大小写）
- 空文件忽略；内容会 `trim`
- 与宿主配置目录（`.pi` / `.omp`）无关，两种宿主共用同一份规则

## 安装

```bash
pi install npm:@shelken/pi-auto-model-prompts          # 上游 Pi
omp plugin install npm:@shelken/pi-auto-model-prompts  # Oh My Pi
```

装好后 `/reload`。

## 配置

路径（项目覆盖全局）：

```text
{cwd}/.agents/pi-auto-model-prompts/config.json   # 项目，覆盖全局
~/.agents/pi-auto-model-prompts/config.json       # 全局
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
{cwd}/.agents/AGENTS.<matcher>.md   # 项目，优先
~/.agents/AGENTS.<matcher>.md       # 全局，兜底
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
