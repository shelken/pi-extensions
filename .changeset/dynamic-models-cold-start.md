---
"@shelken/pi-dynamic-models": patch
---

修复冷缓存首启时 `pi -p --model <动态模型>` 找不到模型：没有缓存的 provider 在 factory 内发现一次，有缓存的 provider 仍不联网；发现失败记 10 分钟冷却，离线时不再每次启动等待超时。
