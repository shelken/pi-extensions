# Changelog

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
