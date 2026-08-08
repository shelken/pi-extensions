# @shelken/pi-title

## 0.2.1

### Patch Changes

- [`edf94bb`](https://github.com/shelken/pi-extensions/commit/edf94bb22b7cf0f292af7e39fdb1fc41bda1488b) Thanks [@shelken](https://github.com/shelken)! - 修复自动标题请求绕过 ModelRuntime 认证链路的问题。标题请求改用 `modelRegistry.complete`，自动复用 pi 从环境变量或凭据存储解析出的认证信息，避免内置 provider 返回空流并被误报为 0% 缓存命中率。

- [#39](https://github.com/shelken/pi-extensions/pull/39) [`2dc47a9`](https://github.com/shelken/pi-extensions/commit/2dc47a926e79d07c8cdd84c7541d9b0aeeb58f99) Thanks [@shelken](https://github.com/shelken)! - 修复自动标题只生成一次：`setSessionName` 同步触发 `session_info_changed`，handler 在 `onTitleSet` 之前执行，把自设标题误判为手动命名并永久锁死后续触发。改为先记录 `lastSetTitle` 再 `setSessionName`，自触发被正确忽略。

- [`969df23`](https://github.com/shelken/pi-extensions/commit/969df231d4f533e4477eaee41fb8d89dffaa2a02) Thanks [@shelken](https://github.com/shelken)! - 移除标题截断:不再按 maxTitleLength 硬切(避免中文标题被腰斩),长度约束交给 prompt;history 新增 rawTitle 记录模型原始输出;默认 maxTitleLength 改为 35

## 0.2.0

### Minor Changes

- [`57b49bd`](https://github.com/shelken/pi-extensions/commit/57b49bd2f8dac4f280464e8621fe17947a8f466b) Thanks [@shelken](https://github.com/shelken)! - 新增 pi-title：复用 session 缓存前缀，仅在上一轮缓存命中率达标（默认 ≥50%）时自动生成会话标题。含命中率门闩（替代仅判 cacheRead>0，避免 0.17% 这类低命中也触发）、标题请求低命中率提醒（默认 <95% 时 warn，无频率限制）、手动命名检测、history.jsonl 审计（含 cacheHitRate）、/title-history 与 /title-settings TUI（浮窗改为 ui.custom overlay，修复 Esc 无法关闭的驻留问题）。新增 cacheThreshold / warnThreshold 配置项。
