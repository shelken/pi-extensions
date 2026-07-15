---
"@shelken/pi-dynamic-models": patch
---

内置 provider 同 id 不覆盖；`/new` 重建 registry 时清空 hash 并重新 register，避免动态模型丢失。
