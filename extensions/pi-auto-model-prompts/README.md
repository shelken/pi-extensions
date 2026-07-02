# pi-auto-model-prompts

为不同模型自动注入不同的系统提示词。

插件会在每次 `before_agent_start` 时读取当前模型匹配的 Markdown 文件，并将内容追加到本轮系统提示词末尾。

**默认行为**：prompt 内容在 `session_start`（含 `/reload`）时读取一次并缓存，本轮 session 内固定。编辑文件后需要执行 `/reload` 才会生效。如果你希望改动立即生效（下一轮消息即反映），在配置中开启 `liveReload`。

## 安装

本插件作为 `pi-extensions` mono repo 的子包维护。通常只需要把仓库根目录作为 Pi package 加到 `settings.json` 的 `packages`，由根 `package.json` 的 `pi.extensions` 加载本插件入口。

```json
{
  "packages": ["/path/to/pi-extensions"]
}
```

修改 `settings.json` 后，在 Pi 中 `/reload` 即可加载。

## 配置

插件默认启用。只要扩展被加载，并且项目或全局 prompt 目录存在匹配文件，就会自动注入。

如需禁用，创建配置文件：

- 项目级：`.pi/extensions/pi-auto-model-prompts/config.json`
- 全局：`~/.pi/agent/extensions/pi-auto-model-prompts/config.json`

内容示例：

```json
{
  "enabled": false,
  "liveReload": false
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用自动注入 |
| `liveReload` | boolean | `false` | 是否每次发消息实时读取 prompt 文件（开启后改文件下一轮立即生效，无需 `/reload`） |

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
session_start → 加载配置（enabled / liveReload）
             → 若 enabled 且 liveReload=false：预读当前模型匹配的 prompt 并缓存

before_agent_start:
  1. enabled=false                → 跳过
  2. 当前模型为空                  → 跳过
  3. liveReload=true              → 实时扫描目录并读取匹配文件
     liveReload=false             → 使用 session_start 时缓存的 prompt
  4. 注入到本轮 systemPrompt 末尾
  5. 项目目录未命中（仅 liveReload 时会逐目录扫描）→ 继续查找全局目录
```

- `liveReload=false`（默认）：prompt 在 `session_start` 时读取一次，本次 session 内固定；编辑 `.md` 后需 `/reload` 刷新。内容稳定，系统提示词前缀不变，有利于命中 provider prompt cache
- `liveReload=true`：每次发消息都会重新扫描目录并读取匹配文件，编辑 `.md` 后**下一次发送消息立即生效**
- `/reload` 会重新触发 `session_start`，刷新配置与缓存
- `liveReload=true` 时修改 `.md` 会改变发给 provider 的 system prompt 前缀，下一次请求可能重建 prompt cache；文件内容稳定后，后续请求可继续命中缓存

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
