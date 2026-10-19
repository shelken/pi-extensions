# @shelken/pi-dynamic-models

从 provider 自身的 `/models` 端点自动发现模型，并补全 `models.json` 中尚未声明的条目。

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
| `debug` | 为 true 时输出详细日志 |

## 行为

- 请求 provider 的 `/models`，读取网关自报的能力：上下文长度、输出上限、输入模态、思考档位。缺这些字段时才回退 models.dev 目录与 pi 默认值。
- 支持裸数组、`{ "data": [...] }`、`{ "models": [...] }` 三种枚举响应；缺 `id` 或字段类型异常的行只跳过该行。探测 `/models` 与 `/v1/models` 时，只有**所有候选都返回空**才视为权威空结果并移除旧 AUTO 模型，空列表不会抢先覆盖非空结果。
- **不覆盖** `models.json` 手写模型，也不覆盖 **pi 内置** 同 id 模型参数；只追加缺失 id。`registerProvider` 会整表替换，实现上会合并：内置 → models.json → 新 AUTO。
- 注册时保留 `models.json` 的 provider 级 `compat`（如 `sessionAffinityFormat`），并交给宿主解析 `$VAR` 凭据。
- 发现请求会带 `apiKey` 与 provider 级 `headers`；`authHeader: false` 时不额外拼 `Authorization`。值按宿主模板语义解析：`$VAR` / `${VAR}` 展开，`$$` 是字面量 `$`，未设置的变量直接跳过而不发送。
- 非对话输出（图片、向量）不注册。思考档位按网关自报项写入 `thinkingLevelMap`，未自报的档位显式标为 `null`，避免选择器暴露网关不接受的档位。
- registry（models.dev）只是可选的数据源：不可达时仍会注册网关模型；缓存 6h，过期后台刷新。
- provider 列表缓存 6h；缓存与端点、协议、账户标识绑定，换端点或账户会重新发现。
- factory 同步用磁盘 cache 注册（session restore 能找到上次的 `provider/id`），**不在启动时联网**；联网发生在 `session_start` 或 `/dynamic-models refresh`。
- 同一次 runtime 内模型内容 hash 未变则跳过重注册；**每次扩展 factory 会清空 hash**（`/new` 会换 ModelRegistry，必须重新 register）。
- 发现结果变化时 `notify`；个别 provider 发现失败只写日志，其他 provider 继续更新，终端不弹发现错误。
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

缓存文件只保存模型能力与端点/账户摘要，不保存密钥或请求头值。
