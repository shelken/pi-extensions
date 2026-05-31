# pi-debug-cache

记录每轮请求的 system prompt 变化和缓存命中情况，用来排查 prompt cache 下降是否与系统提示词前缀变化相关。

插件不会修改请求内容，只做本地落盘记录。

## 功能

- 第一次 agent run 结束时记录当前 effective system prompt 的完整内容和 SHA-256 hash
- 后续每次 agent run 结束后读取当前 effective system prompt
- system prompt hash 未变化时，不重复保存完整 prompt
- system prompt hash 变化时，保存新的完整 prompt，并生成与上一次 prompt 的 diff
- 同时记录本次 assistant response 的 cache usage：`input`、`output`、`cacheRead`、`cacheWrite`、`totalTokens`、缓存命中率
- 产物永久保留，便于事后排查

## 适用场景

当 `pi-cache-graph` 或 provider usage 显示某轮缓存命中率下降时，可以用本插件查看同一轮附近 system prompt 是否发生变化：

- 如果 system prompt hash 没变，缓存下降更可能来自会话内容、工具调用、provider 路由或缓存过期
- 如果 system prompt hash 变了，可查看 diff 定位变化内容，再推断是哪一个扩展或配置影响了全局前缀

本插件只记录相关证据，不直接断言缓存下降的根因。

## 安装

```bash
# 方式一：通过 pi 安装公开 Git 仓库
pi install git:github.com/shelken/pi-debug-cache

# 方式二：作为本地扩展路径加载（settings.json）
# ~/.pi/agent/settings.json
{
  "extensions": [
    "/path/to/pi-debug-cache"
  ]
}

# 方式三：手动复制到扩展目录
cp -r pi-debug-cache ~/.pi/agent/extensions/
```

安装或修改 `settings.json` 后，在 pi 中 `/reload` 即可加载。

## 配置

插件默认关闭。启用后，也只会在第一次 `agent_end` 时创建记录；仅进入 pi 或打开 session 不会创建产物。

如需启用，创建配置文件 `.pi/debug-cache.json`（项目级）或 `~/.pi/agent/debug-cache.json`（全局）：

```json
{
  "enabled": true
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `false` | 是否启用记录 |

项目级配置会覆盖全局配置中的同名字段。

## 产物位置

所有记录写入全局 pi agent 目录：

```text
~/.pi/agent/debug-cache/
├── latest.json
└── sessions/
    └── <sessionId>/
        ├── index.json
        ├── turns.jsonl
        ├── prompts/
        │   ├── 0000-agent_end-<hash>.txt
        │   └── 0003-agent_end-<hash>.txt
        └── diffs/
            └── 0003-agent_end.diff
```

说明：

- `latest.json` 指向最近一次写入的 session 目录
- `index.json` 是会话索引，记录 system prompt hash 历史和文件路径
- `turns.jsonl` 是逐轮 cache usage 记录，每行一个 JSON 对象
- `prompts/*.txt` 保存完整 system prompt，仅在 hash 变化时新增
- `diffs/*.diff` 保存本次 prompt 与上一次 prompt 的行级 diff，仅在 hash 变化时新增
- 文件名序号来自已落盘的 `index.json` 记录数；即使 `/reload` 或扩展重启，也不会从 `0000` 重新开始覆盖旧 diff

产物永久保留。仅打开 session 不会创建目录；第一次 agent run 结束后才会创建对应 session 目录。需要清理时可直接删除对应 session 目录或整个 `~/.pi/agent/debug-cache/`。

## 记录时机

```text
session_start:
  1. 加载配置
  2. 重置内存状态
  3. 不创建目录，不写入文件
  4. 不重置已落盘 session 序号

agent_end:
  1. 读取 ctx.getSystemPrompt()
  2. 计算 hash
  3. 首次 agent_end → 创建 session 目录并保存 full prompt
  4. 后续 hash 变化 → 保存 full prompt 和 diff
  5. 读取本次 agent run 中的 assistant message usage
  6. 追加 cache usage 到 turns.jsonl
```

选择 `agent_end` 是因为一次 agent run 结束时，插件可以同时拿到当前 effective system prompt 和本次返回的 usage。第一次 `agent_end` 视为会话的第一条有效记录，避免仅打开 session 就产生无效调试目录。通常情况下，`agent_start` 到 `agent_end` 之间 system prompt 不会再变化。

## 缓存命中率公式

与 `pi-cache-graph` 保持一致：

```text
cacheHitPercent = cacheRead / (input + cacheRead + cacheWrite) * 100
```

字段含义：

- `input`：本轮新处理的 prompt tokens
- `cacheRead`：从 provider prompt cache 命中的 tokens
- `cacheWrite`：本轮写入 provider prompt cache 的 tokens
- `output`：模型输出 tokens
- `totalTokens`：pi/provider 返回的总 tokens

OpenAI 风格 provider 通常 `cacheWrite = 0`；Anthropic 风格 provider 可能单独报告 `cacheWrite`。

## turns.jsonl 示例

```json
{"sequence":3,"timestamp":"2026-05-28T12:00:00.000Z","event":"agent_end","provider":"anthropic","model":"claude-sonnet-4-5","systemPromptHash":"sha256:abc123","systemPromptChanged":true,"promptPath":"prompts/0003-agent_end-abc123.txt","diffPath":"diffs/0003-agent_end.diff","assistantMessages":1,"input":1234,"output":567,"cacheRead":100000,"cacheWrite":5000,"totalTokens":106801,"cacheHitPercent":93.63}
```

## 命令

```text
/debug-cache status
/debug-cache latest
/debug-cache path
```

- `status`：显示当前 session 记录目录、最新 system prompt hash、变化次数、最近缓存命中率
- `latest`：显示最近一次 system prompt 变化的 prompt/diff 路径
- `path`：显示当前 session 产物目录

## 限制

- 只能记录插件启用后完成的 agent run，无法还原历史 session 中未记录的 prompt
- diff 是行级文本 diff，用于排查内容变化，不保证等同 provider token 级 prefix 差异
- cache usage 依赖 provider/pi 返回的 `usage` 字段；如果 provider 不返回 `cacheRead` 或 `cacheWrite`，记录值会是 0
- system prompt 变化与缓存下降通常相关，但不是唯一原因；provider 路由、缓存过期、会话内容变化、工具 schema 变化也会影响缓存
