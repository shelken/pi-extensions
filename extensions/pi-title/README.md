# pi-title

复用 session 缓存前缀，自动给 pi 会话起标题。自动触发只在**上一轮命中 provider 缓存**时发起只读标题请求；也可以用 `/title fresh` 主动生成。请求复用当前会话前缀，无需单独配置模型。

## 功能

- **缓存门闩**：上一轮命中率（`cacheRead/(input+cacheRead+cacheWrite)`）达 `cacheThreshold`（默认 0.5）才起标题；未命中或命中率过低绝不发请求。
- **低命中率提醒**：标题请求自身命中率低于 `warnThreshold`（默认 0.95）时每次提醒（无频率限制）。
- **字节级复用 live 请求体**：标题请求经 `onPayload` 复用最近一次 live 请求的完整 provider payload（顶层字段全保留，仅末尾追加标题消息），缓存前缀与 live 一致、不逐字段适配。要求 provider 遵守 `onPayload` 契约（pi 内置 12 个 provider 均遵守，自定义 provider 不遵守则退化为 buildParams 产物原样）。
- **按轮触发**：每 N 个 user round（默认 3）起一次，换模型自动归零。
- **尊重手动命名**：你 `/name` 设过的标题不被覆盖，`/name ""` 清空后恢复自动。
- **审计留痕**：每次起标题写入 `history.jsonl`（含真实 `cacheRead` 与 `cacheHitRate`，可验证是否真命中）。
- **命令**：`/title fresh` 主动生成标题，`/title history` 查看本 session 历史，`/title config` 修改配置。

## 快速上手

1. 装好后无需任何配置，正常聊天即可。
2. 用支持 prompt caching 的模型聊满 3 轮（且上一轮命中缓存），session 名会自动变成反映最新对话的标题。
3. 想立即生成标题：运行 `/title fresh`。该命令不检查自动触发门槛，低缓存命中率提醒仍会显示。
4. 想查看历史：运行 `/title history`。
5. 想调间隔、长度或提示词：运行 `/title config`，或直接编辑 config.json。

> 标题请求走当前 session 的模型运行时，custom provider 的认证、缓存和亲和性保持不变。

## 配置

全局 `{pi-agent-dir}/extensions/pi-title/config.json`，项目级 `{cwd}/.pi/extensions/pi-title/config.json` 覆盖全局。

```json
{
  "enabled": true,
  "roundInterval": 3,
  "maxTitleLength": 35,
  "overrideManual": false,
  "cacheThreshold": 0.5,
  "warnThreshold": 0.95,
  "customPrompt": "基于本次对话的最新内容，为这段对话起一个简洁标题。不超过 {maxTitleLength} 个字。直接输出标题文本，不要任何前缀、引号或标点包裹，不要调用任何工具。"
}
```

| 字段 | 默认 | 作用 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `roundInterval` | `3` | 每多少个 user round 起一次标题 |
| `maxTitleLength` | `35` | 提示模型遵守的标题长度上限 |
| `overrideManual` | `false` | 为 `true` 时覆盖手动设的标题 |
| `cacheThreshold` | `0.5` | 门闩最低命中率（0-1），低于则不起标题 |
| `warnThreshold` | `0.95` | 标题请求命中率低于此值（0-1）时提醒 |
| `customPrompt` | 见上 | 起标题提示词，`{maxTitleLength}` 会被替换 |

历史文件：`{pi-agent-dir}/extensions/pi-title/history.jsonl`（append-only，每行一条）。

## 开发

```bash
bun --filter @shelken/pi-title test
```

测试覆盖 config、状态机、history、标题规范化和命令触发链路；TUI 渲染不单测。

## 贡献

在 monorepo 根目录开发，提交前跑 `just verify`；有发布意义的变更写 `.changeset/*.md`。

## 许可证

MIT
