# Changelog

## [0.3.5] - 2026-06-29

### Changed

- `pi-zed-provider` (0.1.3): 实测确认 `/frontend/billing/usage` 用 access_token 返回 401，删除无用请求 `fetchBillingUsage` 和 `ZedBillingUsageResponse` 类型。提取 `resolvePlanAndUsage` 共享函数，统一 `oauth-login.ts` 与 `index.ts` 的 plan/usage 提取逻辑。删除全代码库无调用的死代码：`logScope`、`debugLog`、debug 基础设施（`getDebug`/`safeJson`/`dump`/`dumpRequest`/`dumpResponse`）、`normalizeConfig`。

## [0.3.4] - 2026-06-08

### Fixed

- `pi-co-authored-by`: RTK 前缀清理只作用于真实 shell 命令位置，避免改写 commit message 参数里的普通 `rtk git` 文本。
- `pi-co-authored-by`: `containsGitCommit` 和注入的 `git()` wrapper 共用 git global option 列表，避免两边支持范围漂移。

## [0.3.3] - 2026-06-08

### Fixed

- `pi-co-authored-by`: RTK 改写复合命令时 `cmd.replace()` 只替换第一个 `rtk git`，导致后续 `rtk git commit` 未被拦截，trailer 丢失。改用 `replaceAll`。
- `pi-co-authored-by`: `containsGitCommit` regex 增加 `rtk` 可选前缀匹配。

## [0.3.2] - 2026-06-08

### Changed

- `pi-dynamic-models`: 工厂函数不再阻塞扩展加载链，网络请求和同步 IO 移入 `session_start` hook。

## [0.3.0] - 2026-06-07

### Added

- `simple-plannotator` 扩展：在浏览器中审查本地 git 变更（`/pnr`）、
  标注 Markdown 文件（`/pna`）、标注最后一条 AI 消息（`/pnl`）。
