# pi-auto-model-prompts

为不同模型自动注入不同的系统提示词。

插件会在每次 `before_agent_start` 时读取当前模型匹配的 Markdown 文件，并将内容追加到本轮系统提示词末尾。文件内容不变时，最终系统提示词稳定；编辑文件后，下一次发送消息立即使用新内容。

## 安装

```bash
# 方式一：通过 pi 安装公开 Git 仓库
pi install git:github.com/shelken/pi-auto-model-prompts

# 方式二：作为本地扩展路径加载（settings.json）
# ~/.pi/agent/settings.json
{
  "extensions": [
    "/path/to/pi-auto-model-prompts"
  ]
}

# 方式三：手动复制到扩展目录
cp -r pi-auto-model-prompts ~/.pi/agent/extensions/
```

安装或修改 `settings.json` 后，在 pi 中 `/reload` 即可加载。

## 配置

插件默认启用。只要扩展被加载，并且项目或全局 prompt 目录存在匹配文件，就会自动注入。

如需禁用，创建配置文件 `.pi/auto-model-prompts.json`（项目级）或 `~/.pi/agent/auto-model-prompts.json`（全局）：

```json
{
  "enabled": false
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用自动注入 |

项目级配置会覆盖全局配置中的同名字段。

## Prompt 文件

在项目级或全局目录下创建 `.md` 文件，文件名即匹配规则：

```text
# 项目级，优先级高
.pi/auto-model-prompts/

# 全局，项目目录没有匹配内容时使用
~/.pi/agent/auto-model-prompts/
```

示例：

```text
.pi/auto-model-prompts/
├── gpt-5.5.md          ← 精确匹配模型 gpt-5.5
├── gpt-*.md            ← 匹配所有 gpt 前缀模型（gpt-4o, gpt-5.5…）
├── gpt-5.*.md          ← 匹配 gpt-5.1, gpt-5.5 等（比 gpt-* 更具体）
├── claude-sonnet.md    ← 精确匹配 claude-sonnet
├── claude-*.md         ← 匹配所有 claude 前缀模型
└── *.md                ← 兜底，匹配所有模型
```

文件内容为纯 Markdown 文本，会在 `before_agent_start` 事件中追加到本轮系统提示词末尾。

**提示**：文件内容会被 `trim()` 处理，首尾空白会被去除。空文件会被忽略。

## 目录优先级

插件按以下顺序查找 prompt：

1. 项目目录：`.pi/auto-model-prompts/`
2. 全局目录：`~/.pi/agent/auto-model-prompts/`

如果项目目录没有任何非空匹配文件，才会继续查找全局目录。

## 匹配优先级

同一个目录内，从高到低：

1. **精确匹配** — 文件名与模型 ID 完全一致，如 `gpt-5.5.md`
2. **前缀匹配** — 文件名以 `*` 结尾，去掉 `*` 后作为前缀匹配模型 ID。多个前缀匹配时，前缀越长越优先（如 `gpt-5.*.md` 优先于 `gpt-*.md`）
3. **通配匹配** — `*.md` 匹配所有模型，优先级最低

每次只会注入一个 prompt——匹配到的第一个非空文件。

### 示例

模型 ID 为 `gpt-5.5`，目录下有以下文件：

| 文件 | 是否匹配 |
|------|----------|
| `gpt-5.5.md` | ✅ 精确匹配，命中 |
| `gpt-5.*.md` | 跳过（已被精确匹配命中） |
| `gpt-*.md` | 跳过 |
| `*.md` | 跳过 |

命中 `gpt-5.5.md`。

模型 ID 为 `gpt-4o`：

| 文件 | 是否匹配 |
|------|----------|
| `gpt-5.5.md` | ❌ 不一致 |
| `gpt-5.*.md` | ❌ 不匹配 `gpt-5.` 前缀 |
| `gpt-*.md` | ✅ 匹配 `gpt-` 前缀，命中 |
| `*.md` | 跳过 |

命中 `gpt-*.md`。

## 工作原理

```text
session_start → 加载 enabled 配置

before_agent_start:
  1. enabled=false       → 跳过
  2. 当前模型为空        → 跳过
  3. 扫描项目 prompt 目录 → 匹配非空文件 → 注入到本轮 systemPrompt 末尾
  4. 项目目录未命中      → 扫描全局 prompt 目录
```

- 每次发送消息都会重新扫描目录并读取匹配文件
- 同一模型不会在同一轮中重复注入；下一轮会基于 pi 重新构建的 system prompt 再注入一次
- 编辑 `.md` 文件后**下一次发送消息立即生效**，无需 `/reload`
- 修改 `.md` 会改变发给 provider 的 system prompt 前缀，下一次请求可能重建 prompt cache；文件内容稳定后，后续请求可继续命中缓存
- `/reload` 后会重新加载配置

## 禁用插件

将配置中 `enabled` 设为 `false`，然后 `/reload`：

```json
{
  "enabled": false
}
```

## 故障排查

如果注入未生效，检查以下几点：

1. 扩展是否已加载，必要时在 pi 中执行 `/reload`
2. 配置文件中是否显式设置了 `"enabled": false`
3. `.pi/auto-model-prompts/` 或 `~/.pi/agent/auto-model-prompts/` 是否存在且包含 `.md` 文件
4. 匹配到的 `.md` 文件是否为空
5. 模型名称是否与文件名匹配（注意大小写和连字符）
