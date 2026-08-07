---
"@shelken/pi-dynamic-models": patch
---

并发锁与失败冷却：多进程同时启动时不再重复拉取 registry/provider 网络请求；不可达 provider 失败后 10 分钟内冷却，不再每次 session_start 白等超时
