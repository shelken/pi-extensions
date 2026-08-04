# Changelog

All notable changes to this monorepo and its packages. This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **@shelken/pi-title**: 缓存复用自动会话标题扩展（spec #30）。仅在上一轮 provider 响应命中缓存时自动生成标题；前缀与 live 轮逐字节一致；每 N round 触发；尊重手动命名；history.jsonl 审计；TUI：`/title-history` + `/title-settings`。
