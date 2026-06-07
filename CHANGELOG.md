# Changelog

## [0.3.2] - 2026-06-08

### Changed

- `pi-dynamic-models`: 工厂函数不再阻塞扩展加载链，网络请求和同步 IO 移入 `session_start` hook。

## [0.3.0] - 2026-06-07

### Added

- `simple-plannotator` 扩展：在浏览器中审查本地 git 变更（`/pnr`）、
  标注 Markdown 文件（`/pna`）、标注最后一条 AI 消息（`/pnl`）。
