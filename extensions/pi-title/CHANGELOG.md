# @shelken/pi-title

## 0.2.0

### Minor Changes

- [`57b49bd`](https://github.com/shelken/pi-extensions/commit/57b49bd2f8dac4f280464e8621fe17947a8f466b) Thanks [@shelken](https://github.com/shelken)! - 新增 pi-title：复用 session 缓存前缀，仅在上一轮缓存命中率达标（默认 ≥50%）时自动生成会话标题。含命中率门闩（替代仅判 cacheRead>0，避免 0.17% 这类低命中也触发）、标题请求低命中率提醒（默认 <95% 时 warn，无频率限制）、手动命名检测、history.jsonl 审计（含 cacheHitRate）、/title-history 与 /title-settings TUI（浮窗改为 ui.custom overlay，修复 Esc 无法关闭的驻留问题）。新增 cacheThreshold / warnThreshold 配置项。
