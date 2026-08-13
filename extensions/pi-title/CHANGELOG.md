# @shelken/pi-title

## 0.3.0

### Minor Changes

- [`37fcf1d`](https://github.com/shelken/pi-extensions/commit/37fcf1dc44eaed32ca53d52df659e1b80c767cc5) Thanks [@shelken](https://github.com/shelken)! - 将标题历史和配置入口合并为 `/title history` 与 `/title config`，新增 `/title fresh` 主动生成标题。主动生成不检查自动触发门槛，低缓存命中率提醒保持生效。

- [`034d7b4`](https://github.com/shelken/pi-extensions/commit/034d7b427706c5181388499588310bd5d7f2cd71) Thanks [@shelken](https://github.com/shelken)! - 弃用 pi-title:从根 `pi.extensions` 移除入口,不再加载;子包与根 README 标记弃用。

- [`c6e80fb`](https://github.com/shelken/pi-extensions/commit/c6e80fb992b5c3ef513948f346ecd2842c4c12b5) Thanks [@shelken](https://github.com/shelken)! - 重构标题请求缓存复用：改用 `onPayload` 字节级复用最近一次 live 请求的完整 provider payload（顶层字段全保留，仅末尾追加 buildParams 构造的标题消息），缓存前缀与 live 一致、不逐字段适配，新 provider 自动覆盖。

  回归根源：08-08 认证修复（edf94bb）把标题请求从 `provider.streamSimple` 迁到 `modelRegistry.complete`，丢失 streamSimple 入口的 `reasoning→reasoningEffort` 转换与 `maxTokens` 默认填充，导致 thinking/reasoning_effort/max_tokens 与 live 不同缓存域、缓存失效。

  本次一并移除为对齐 messages 而堆叠的补丁（`convertToLlm`、`applyContextPruneIndex`、`msgFingerprint`）——live payload 已继承这些处理，无需 pi-title 重复。`CacheMissDumper` 保留为诊断工具，触发条件从 `hitRate < warnThreshold` 改为 `config.debug` 开启时每次标题请求都落盘（含 live/title 完整 payload + usage），`/title config` 新增 debug 开关。要求 provider 遵守 `onPayload` 契约（调 `options.onPayload` + 用返回值替换发送体 + 替换后不再强写），pi 内置 12 个 provider 均遵守；不遵守的自定义 provider 退化为 buildParams 产物原样。

### Patch Changes

- [`a207ea5`](https://github.com/shelken/pi-extensions/commit/a207ea5ee9d6dbea535da8b42d92eb024bdbc6c4) Thanks [@shelken](https://github.com/shelken)! - 生成标题前应用 pi-context-prune 的持久化索引，使标题请求与实时请求复用相同的缓存前缀。

- [`3c69137`](https://github.com/shelken/pi-extensions/commit/3c6913723275c3da1ce241ff0226aaa7c6ecd8bc) Thanks [@shelken](https://github.com/shelken)! - 按 pi-context-prune 的实时 Context Hook 规则重定位已提交 summary，避免 context_prune housekeeping 调用使标题请求的缓存前缀错位。

- [`25e9fa2`](https://github.com/shelken/pi-extensions/commit/25e9fa256a72268b5b98c5b0c0c72fe81ef6eff2) Thanks [@shelken](https://github.com/shelken)! - /title history 按用户本地时区显示记录时间，不再固定显示 UTC。

- [`7db816f`](https://github.com/shelken/pi-extensions/commit/7db816f350ba00996165215a452a4166730849a5) Thanks [@shelken](https://github.com/shelken)! - fix(pi-title): 严格复用 live provider payload；fresh 异步、防重入并在 120 秒强制超时；reload 保留 live，无 live 时延后到下一轮；收拢为单文件实现

- [`1d581c8`](https://github.com/shelken/pi-extensions/commit/1d581c8a820de97ea086d660c7b841599e448014) Thanks [@shelken](https://github.com/shelken)! - `/title fresh` 无 live payload 时（reload 后未对话、刚换模型）不再静默排队，改用不含对话历史的精简请求立即生成；成功后 notify 显示新标题。

- [`269b6a9`](https://github.com/shelken/pi-extensions/commit/269b6a9d7cd865f1a97f913ef4b9d12f26fecf37) Thanks [@shelken](https://github.com/shelken)! - 新增低命中率现场 dump：标题请求命中率低于 `warnThreshold` 时，把 live 请求与标题请求的完整 provider payload（含 system/messages/tools）与 usage 落盘到 `{pi-agent-dir}/logs/pi-title-miss/`（保留最近 10 份），用于缓存前缀字节级对比排查。

- [`01366c4`](https://github.com/shelken/pi-extensions/commit/01366c4752c9b1803878641954a5cbb8258e57cf) Thanks [@shelken](https://github.com/shelken)! - `/title`（无子命令）不再报 Usage 错误，改为 notify 当前会话标题；标题未设置时提示"当前会话还没有标题"。

## 0.2.1

### Patch Changes

- [`edf94bb`](https://github.com/shelken/pi-extensions/commit/edf94bb22b7cf0f292af7e39fdb1fc41bda1488b) Thanks [@shelken](https://github.com/shelken)! - 修复自动标题请求绕过 ModelRuntime 认证链路的问题。标题请求改用 `modelRegistry.complete`，自动复用 pi 从环境变量或凭据存储解析出的认证信息，避免内置 provider 返回空流并被误报为 0% 缓存命中率。

- [#39](https://github.com/shelken/pi-extensions/pull/39) [`2dc47a9`](https://github.com/shelken/pi-extensions/commit/2dc47a926e79d07c8cdd84c7541d9b0aeeb58f99) Thanks [@shelken](https://github.com/shelken)! - 修复自动标题只生成一次：`setSessionName` 同步触发 `session_info_changed`，handler 在 `onTitleSet` 之前执行，把自设标题误判为手动命名并永久锁死后续触发。改为先记录 `lastSetTitle` 再 `setSessionName`，自触发被正确忽略。

- [`969df23`](https://github.com/shelken/pi-extensions/commit/969df231d4f533e4477eaee41fb8d89dffaa2a02) Thanks [@shelken](https://github.com/shelken)! - 移除标题截断:不再按 maxTitleLength 硬切(避免中文标题被腰斩),长度约束交给 prompt;history 新增 rawTitle 记录模型原始输出;默认 maxTitleLength 改为 35

## 0.2.0

### Minor Changes

- [`57b49bd`](https://github.com/shelken/pi-extensions/commit/57b49bd2f8dac4f280464e8621fe17947a8f466b) Thanks [@shelken](https://github.com/shelken)! - 新增 pi-title：复用 session 缓存前缀，仅在上一轮缓存命中率达标（默认 ≥50%）时自动生成会话标题。含命中率门闩（替代仅判 cacheRead>0，避免 0.17% 这类低命中也触发）、标题请求低命中率提醒（默认 <95% 时 warn，无频率限制）、手动命名检测、history.jsonl 审计（含 cacheHitRate）、/title-history 与 /title-settings TUI（浮窗改为 ui.custom overlay，修复 Esc 无法关闭的驻留问题）。新增 cacheThreshold / warnThreshold 配置项。
