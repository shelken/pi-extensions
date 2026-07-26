---
"@shelken/pi-dynamic-models": patch
---

修复 provider 模型缓存过期后不再更新的问题；缓存 TTL 调整为 6 小时。
网络失败不再写缓存（避免 mtime 伪装成 6h 新鲜）。
优先 models.dev reasoning effort；未提供时用硬编码 thinking 映射；完整映射 cost。
