---
"@shelken/pi-title": minor
---

重构标题请求缓存复用：改用 `onPayload` 字节级复用最近一次 live 请求的完整 provider payload（顶层字段全保留，仅末尾追加 buildParams 构造的标题消息），缓存前缀与 live 一致、不逐字段适配，新 provider 自动覆盖。

回归根源：08-08 认证修复（edf94bb）把标题请求从 `provider.streamSimple` 迁到 `modelRegistry.complete`，丢失 streamSimple 入口的 `reasoning→reasoningEffort` 转换与 `maxTokens` 默认填充，导致 thinking/reasoning_effort/max_tokens 与 live 不同缓存域、缓存失效。

本次一并移除为对齐 messages 而堆叠的补丁（`convertToLlm`、`applyContextPruneIndex`、`msgFingerprint`）——live payload 已继承这些处理，无需 pi-title 重复。`CacheMissDumper` 保留为诊断工具，触发条件从 `hitRate < warnThreshold` 改为 `config.debug` 开启时每次标题请求都落盘（含 live/title 完整 payload + usage），`/title config` 新增 debug 开关。要求 provider 遵守 `onPayload` 契约（调 `options.onPayload` + 用返回值替换发送体 + 替换后不再强写），pi 内置 12 个 provider 均遵守；不遵守的自定义 provider 退化为 buildParams 产物原样。
