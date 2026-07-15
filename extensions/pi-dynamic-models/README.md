# @shelken/pi-dynamic-models

从 models.dev 自动发现并补全 `models.json` 中远端 provider 的模型列表。

## 安装

```bash
pi install npm:@shelken/pi-dynamic-models
```

## 配置

路径（后者覆盖前者）：

- `{pi-agent-dir}/extensions/pi-dynamic-models/config.json`
- `.pi/extensions/pi-dynamic-models/config.json`

```json
{
  "enable": true,
  "enableProviders": ["cpa"],
  "excludePatterns": ["gpt-image-*", "sora-*"],
  "debug": false
}
```

| 字段 | 说明 |
|---|---|
| `enable` | 总开关 |
| `enableProviders` | 要发现的 provider。**省略**、`"*"` 或 `["*"]` = `models.json` 里所有带 `baseUrl` 的 provider；`[]` = 不启用 |
| `excludePatterns` | glob（`*` / `?`），匹配的 **AUTO** id 不注册；不碰手写模型 |
| `debug` | 为 true 时逐模型日志 + console |

## 行为

- 读 `{pi-agent-dir}/models.json` 的 `baseUrl` / `apiKey` / `api`，请求 provider 的 `/models`
- 不覆盖手动模型；registry 缓存 6h（过期先用旧数据再后台刷新）；provider 列表缓存 10min
- factory 同步用磁盘 cache 注册 AUTO 模型（session restore 能找到上次的 `provider/id`）
- 同进程内 AUTO 列表 hash 未变则跳过重注册；默认只打摘要日志
- 默认过滤 `contextWindow === 0`（如 image 模型）
- 页脚 `setStatus`：如 `cpa +47`；列表变化或首次发现时 `notify`
- 日志：`{pi-agent-dir}/logs/pi-dynamic-models.log`

## 命令

```text
/dynamic-models          # status：上次摘要 + provider cache 列表
/dynamic-models status
/dynamic-models refresh  # 强制拉网并重注册（忽略 freshness）
```

## 缓存

- registry：`{pi-agent-dir}/cache/models-registry.json`
- provider：`{pi-agent-dir}/cache/provider-models/<name>.json`
