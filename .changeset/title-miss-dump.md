---
"@shelken/pi-title": patch
---

新增低命中率现场 dump：标题请求命中率低于 `warnThreshold` 时，把 live 请求与标题请求的完整 provider payload（含 system/messages/tools）与 usage 落盘到 `{pi-agent-dir}/logs/pi-title-miss/`（保留最近 10 份），用于缓存前缀字节级对比排查。
